import { OrderType, Side } from "@polymarket/clob-client";
import { sleep } from "bun";
import { formatUnits, parseUnits } from "ethers/lib/utils";
import { USDCE_DIGITS } from "./polymarket/constants";
import { extractAssetIdsFromTrades } from "./utils";
import { portfolioState } from "./utils/portfolio-state";
import axios from "axios"; // Added axios for HTTP requests
import dayjs from "dayjs"; // Import dayjs for date formatting
import { ethers } from "ethers"; // Import ethers for utils

// Custom logging functions to include timestamps
const getTimestamp = () => dayjs().format("YYYY-MM-DD HH:mm:ss,SSS");
const log = (message: string) => console.log(`${getTimestamp()} - INFO - ${message}`);
const error = (message: string, err?: any) => console.error(`${getTimestamp()} - ERROR - ${message}`, err || '');

// Configuration from environment variables
const USER_DEFINED_TARGET_PRICE = parseFloat(process.env.USER_DEFINED_TARGET_PRICE || '0');
const TRADE_BUFFER_USD = parseFloat(process.env.TRADE_BUFFER_USD || '0');
const POLYMARKET_MARKET_ID = process.env.POLYMARKET_MARKET_ID;
const TEST_TOKEN_ID_UP = process.env.TEST_TOKEN_ID_UP;
const TEST_TOKEN_ID_DOWN = process.env.TEST_TOKEN_ID_DOWN;
const POLL_INTERVAL_SECONDS = parseInt(process.env.POLL_INTERVAL_SECONDS || '10');
const ORDER_PRICE_BUY = parseFloat(process.env.ORDER_PRICE_BUY || '0.98');
const ORDER_PRICE_SELL = parseFloat(process.env.ORDER_PRICE_SELL || '0.02');
const MIN_TRADE_AMOUNT_USD = parseFloat(process.env.MIN_TRADE_AMOUNT_USD || '1.0');
const FIXED_TRADE_USD_AMOUNT = parseFloat(process.env.FIXED_TRADE_USD_AMOUNT || '10');
const TRADE_SIZE_PERCENT = parseFloat(process.env.TRADE_SIZE_PERCENT || '0');

const MINIMUM_BALANCE = BigInt(ethers.utils.parseUnits("1", USDCE_DIGITS).toString());

// Simplified initializeCurrentPosition - focuses on UP/DOWN tokens
async function initializeCurrentPosition(assetIds: string[]): Promise<string | null> {
  try {
    let currentPosition: string | null = null;

    if (TEST_TOKEN_ID_UP && assetIds.includes(TEST_TOKEN_ID_UP)) {
      const balance = await portfolioState.fetchAssetBalanceIfNeeded(TEST_TOKEN_ID_UP);
      if (BigInt(balance) > MINIMUM_BALANCE) {
        log(`Found active position: 'UP' (${ethers.utils.formatUnits(balance, USDCE_DIGITS)} shares)`);
        currentPosition = 'UP';
      }
    }

    if (TEST_TOKEN_ID_DOWN && assetIds.includes(TEST_TOKEN_ID_DOWN)) {
      const balance = await portfolioState.fetchAssetBalanceIfNeeded(TEST_TOKEN_ID_DOWN);
      if (BigInt(balance) > MINIMUM_BALANCE) {
        log(`Found active position: 'DOWN' (${ethers.utils.formatUnits(balance, USDCE_DIGITS)} shares)`);
        currentPosition = 'DOWN';
      }
    }

    if (!currentPosition) {
      log(`No active positions found above minimum threshold for UP/DOWN tokens.`);
    }
    return currentPosition;
  } catch (err) {
    error("Error initializing position:", err);
    process.exit(1);
  }
}

async function sellPosition(tokenId: string, amount: string): Promise<boolean> {
  try {
    log(`Selling position ${tokenId}, amount: ${ethers.utils.formatUnits(amount, USDCE_DIGITS)}`);
    const sellOrder = await portfolioState.clobClient.createMarketOrder({
      tokenID: tokenId,
      amount: parseFloat(ethers.utils.formatUnits(amount, USDCE_DIGITS)),
      side: Side.SELL,
    });
    await portfolioState.clobClient.postOrder(sellOrder, OrderType.FOK);
    portfolioState.updateAssetBalance(tokenId, "0"); // Update cached balance
    log(`Successfully sold ${tokenId}`);
    return true;
  } catch (err) {
    error(`Error selling ${tokenId}:`, err);
    return false;
  }
}

async function buyPosition(tokenId: string, amountUSD: number): Promise<boolean> {
  // Use cached collateral balance or fetch if needed
  await portfolioState.fetchCollateralBalance();

  if (BigInt(portfolioState.collateralBalance) === BigInt(0)) {
    log(`No collateral available for buying.`);
    return false;
  }

  const collateralAmount = parseFloat(ethers.utils.formatUnits(portfolioState.collateralBalance, USDCE_DIGITS));
  let tradeAmount = amountUSD;

  if (TRADE_SIZE_PERCENT > 0) {
    tradeAmount = collateralAmount * (TRADE_SIZE_PERCENT / 100.0);
  } else {
    tradeAmount = FIXED_TRADE_USD_AMOUNT;
  }

  if (tradeAmount > collateralAmount) {
    tradeAmount = collateralAmount;
  }

  if (tradeAmount < MIN_TRADE_AMOUNT_USD) {
    log(`Trade amount $${tradeAmount.toFixed(2)} is below minimum of $${MIN_TRADE_AMOUNT_USD}. Skipping.`);
    return false;
  }

  try {
    log(`Opening new position '${tokenId === TEST_TOKEN_ID_UP ? 'UP' : 'DOWN'}' for ~$${tradeAmount.toFixed(2)}`);
    const buyOrder = await portfolioState.clobClient.createMarketOrder({
      tokenID: tokenId,
      amount: tradeAmount,
      side: Side.BUY,
    });
    await portfolioState.clobClient.postOrder(buyOrder, OrderType.FOK);
    // Update collateral balance after purchase
    const newCollateralBalance = ethers.BigNumber.from(portfolioState.collateralBalance).sub(
      parseUnits(tradeAmount.toFixed(USDCE_DIGITS), USDCE_DIGITS)
    );
    portfolioState.updateCollateralBalance(newCollateralBalance.toString());
    portfolioState.updateAssetBalance(tokenId, "refresh_needed"); // Mark token balance for refresh
    log(`Successfully opened '${tokenId === TEST_TOKEN_ID_UP ? 'UP' : 'DOWN'}' position. Cost: $${tradeAmount.toFixed(2)}`);
    return true;
  } catch (err) {
    error(`Error buying token ${tokenId}:`, err);
    return false;
  }
}

async function getLiveBtcPriceFromBinance(): Promise<number | null> {
  try {
    const response = await axios.get("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", { timeout: 10000 });
    return parseFloat(response.data.price);
  } catch (e) {
    error(`Error fetching price from Binance: ${e}`);
    return null;
  }
}

async function runCycle(assetIds: string[]): Promise<void> {
  try {
    if (!USER_DEFINED_TARGET_PRICE) {
      error("FATAL: USER_DEFINED_TARGET_PRICE not set in .env");
      process.exit(1);
    }

    const livePrice = await getLiveBtcPriceFromBinance();
    if (livePrice === null) {
      return;
    }

    const currentPosition = await initializeCurrentPosition(assetIds); // Get current position (UP/DOWN/null)

    const upperBound = USER_DEFINED_TARGET_PRICE + TRADE_BUFFER_USD;
    const lowerBound = USER_DEFINED_TARGET_PRICE - TRADE_BUFFER_USD;

    let desiredPosition: 'UP' | 'DOWN' | null = null;

    if (livePrice > upperBound) {
      desiredPosition = 'UP';
    } else if (livePrice < lowerBound) {
      desiredPosition = 'DOWN';
    }

    log(
      `Live Price: $${livePrice.toFixed(2)} | Target: $${USER_DEFINED_TARGET_PRICE.toFixed(2)} | ` +
      `Current Position: '${currentPosition || 'None'}' | Desired Position: '${desiredPosition || 'Hold'}'`
    );

    if (desiredPosition && desiredPosition !== currentPosition) {
      log(`🚨 Position change detected: From '${currentPosition || 'None'}' to '${desiredPosition}'`);

      // Close existing position if any
      if (currentPosition === 'UP' && TEST_TOKEN_ID_UP) {
        const balance = await portfolioState.fetchAssetBalanceIfNeeded(TEST_TOKEN_ID_UP);
        if (BigInt(balance) > MINIMUM_BALANCE) {
          await sellPosition(TEST_TOKEN_ID_UP, balance);
          await sleep(3000); // Wait for blockchain state to update
        }
      } else if (currentPosition === 'DOWN' && TEST_TOKEN_ID_DOWN) {
        const balance = await portfolioState.fetchAssetBalanceIfNeeded(TEST_TOKEN_ID_DOWN);
        if (BigInt(balance) > MINIMUM_BALANCE) {
          await sellPosition(TEST_TOKEN_ID_DOWN, balance);
          await sleep(3000); // Wait for blockchain state to update
        }
      }

      // Open new position
      const tokenToBuy = desiredPosition === 'UP' ? TEST_TOKEN_ID_UP : TEST_TOKEN_ID_DOWN;
      if (tokenToBuy) {
        await buyPosition(tokenToBuy, FIXED_TRADE_USD_AMOUNT); // Use FIXED_TRADE_USD_AMOUNT for simplicity, or calculate based on TRADE_SIZE_PERCENT
      } else {
        error(`Missing token ID for desired position: ${desiredPosition}`);
      }
    }
  } catch (err) {
    error("Error in bot cycle:", err);
  }
}

// Main function
async function main(): Promise<void> {
  log(`--- Starting BTC Price Bot. Target BTC Price: $${USER_DEFINED_TARGET_PRICE.toFixed(2)} ---`);
  log(`Environment Setup Complete`);
  log(`Starting trading strategy...`);
  log(`Target Price: $${USER_DEFINED_TARGET_PRICE.toFixed(2)}`);
  log(`Trade Amount per Position: $${(TRADE_SIZE_PERCENT > 0 ? (FIXED_TRADE_USD_AMOUNT * (TRADE_SIZE_PERCENT / 100.0)) : FIXED_TRADE_USD_AMOUNT).toFixed(2)}`);
  log(`Trade Buffer (USD): $${TRADE_BUFFER_USD.toFixed(2)}`);
  log(`Poll Interval: ${POLL_INTERVAL_SECONDS} seconds`);

  while (true) {
    const now = dayjs();
    if (now.hour() === 17 && now.minute() === 10) {
      log("Stopping bot as it's 17:10.");
      process.exit(0);
    }

    // Fetch trades and asset IDs for runCycle
    let trades = await portfolioState.clobClient.getTrades();
    let assetIds = extractAssetIdsFromTrades(trades);

    // Fetch and log collateral balance (this will now reflect changes from trades)
    const collateralBalance = await portfolioState.fetchCollateralBalance();
    log(`Current Collateral Balance: $${ethers.utils.formatUnits(collateralBalance, USDCE_DIGITS)}`);

    await runCycle(assetIds);

    await sleep(POLL_INTERVAL_SECONDS * 1000); // Wait for configured interval
  }
}

main().catch((err) => {
  error("Unhandled error in main:", err);
  process.exit(1);
});
