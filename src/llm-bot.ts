// استيراد المكتبات والوحدات النمطية الضرورية
import { OrderType, Side } from "@polymarket/clob-client"; // أنواع الأوامر والجهات من عميل Polymarket CLOB
import { sleep } from "bun"; // وظيفة التأخير (النوم)
import { formatUnits, parseUnits } from "ethers/lib/utils"; // أدوات تنسيق وتحليل الوحدات من Ethers.js
import { USDCE_DIGITS } from "./polymarket/constants"; // ثوابت خاصة بـ Polymarket، مثل عدد أرقام USDC العشرية
import { extractAssetIdsFromTrades } from "./utils"; // وظيفة لاستخراج معرفات الأصول من الصفقات
import { portfolioState } from "./utils/portfolio-state"; // حالة المحفظة والتفاعل مع Polymarket (هنا يتم الاتصال بمنصة Polymarket)
import axios from "axios"; // مكتبة لإجراء طلبات HTTP (لجلب سعر البيتكوين)
import dayjs from "dayjs"; // مكتبة لتنسيق التواريخ والأوقات
import { ethers } from "ethers"; // مكتبة Ethers.js للتعامل مع Ethereum

// دوال تسجيل الدخول المخصصة لتضمين الطوابع الزمنية
const getTimestamp = () => dayjs().format("YYYY-MM-DD HH:mm:ss,SSS"); // الحصول على الطابع الزمني الحالي
const log = (message: string) => console.log(`${getTimestamp()} - INFO - ${message}`); // تسجيل رسائل المعلومات
const error = (message: string, err?: any) => console.error(`${getTimestamp()} - ERROR - ${message}`, err || ''); // تسجيل رسائل الأخطاء

// إعدادات البوت من متغيرات البيئة
const USER_DEFINED_TARGET_PRICE = parseFloat(process.env.USER_DEFINED_TARGET_PRICE || '0'); // السعر المستهدف للبيتكوين
const TRADE_BUFFER_USD = parseFloat(process.env.TRADE_BUFFER_USD || '0'); // الهامش حول السعر المستهدف (بالدولار الأمريكي)
const POLYMARKET_MARKET_ID = process.env.POLYMARKET_MARKET_ID; // معرف سوق Polymarket المحدد
const TEST_TOKEN_ID_UP = process.env.TEST_TOKEN_ID_UP; // معرف الرمز المميز لـ "UP" في السوق
const TEST_TOKEN_ID_DOWN = process.env.TEST_TOKEN_ID_DOWN; // معرف الرمز المميز لـ "DOWN" في السوق
const POLL_INTERVAL_SECONDS = parseInt(process.env.POLL_INTERVAL_SECONDS || '10'); // الفاصل الزمني بين عمليات فحص السعر (بالثواني)
const ORDER_PRICE_BUY = parseFloat(process.env.ORDER_PRICE_BUY || '0.98'); // سعر أمر الشراء (غير مستخدم حاليًا لأوامر السوق)
const ORDER_PRICE_SELL = parseFloat(process.env.ORDER_PRICE_SELL || '0.02'); // سعر أمر البيع (غير مستخدم حاليًا لأوامر السوق)
const MIN_TRADE_AMOUNT_USD = parseFloat(process.env.MIN_TRADE_AMOUNT_USD || '1.0'); // الحد الأدنى لمبلغ التداول بالدولار الأمريكي
const FIXED_TRADE_USD_AMOUNT = parseFloat(process.env.FIXED_TRADE_USD_AMOUNT || '10'); // مبلغ USD ثابت للتداول
const TRADE_SIZE_PERCENT = parseFloat(process.env.TRADE_SIZE_PERCENT || '0'); // نسبة مئوية من الرصيد للتداول (0 لتعطيل)

// الحد الأدنى للرصيد المطلوب للاعتبار كمركز نشط
const MINIMUM_BALANCE = BigInt(ethers.utils.parseUnits("1", USDCE_DIGITS).toString());

// وظيفة تهيئة المركز الحالي المبسطة - تركز على رموز UP/DOWN
async function initializeCurrentPosition(assetIds: string[]): Promise<string | null> {
  try {
    let currentPosition: string | null = null;

    // التحقق من وجود مركز "UP" نشط
    if (TEST_TOKEN_ID_UP && assetIds.includes(TEST_TOKEN_ID_UP)) {
      const balance = await portfolioState.fetchAssetBalanceIfNeeded(TEST_TOKEN_ID_UP);
      if (BigInt(balance) > MINIMUM_BALANCE) {
        log(`Found active position: 'UP' (${ethers.utils.formatUnits(balance, USDCE_DIGITS)} shares)`);
        currentPosition = 'UP';
      }
    }

    // التحقق من وجود مركز "DOWN" نشط
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

// وظيفة بيع المركز الحالي
async function sellPosition(tokenId: string, amount: string): Promise<boolean> {
  try {
    log(`Selling position ${tokenId}, amount: ${ethers.utils.formatUnits(amount, USDCE_DIGITS)}`);
    const sellOrder = await portfolioState.clobClient.createMarketOrder({
      tokenID: tokenId,
      amount: parseFloat(ethers.utils.formatUnits(amount, USDCE_DIGITS)),
      side: Side.SELL,
    });
    await portfolioState.clobClient.postOrder(sellOrder, OrderType.FOK);
    portfolioState.updateAssetBalance(tokenId, "0"); // تحديث الرصيد المخزن مؤقتًا
    log(`Successfully sold ${tokenId}`);
    return true;
  } catch (err) {
    error(`Error selling ${tokenId}:`, err);
    return false;
  }
}

// وظيفة شراء مركز جديد
async function buyPosition(tokenId: string, amountUSD: number): Promise<boolean> {
  // استخدام الرصيد الضماني المخزن مؤقتًا أو جلبه إذا لزم الأمر
  await portfolioState.fetchCollateralBalance();

  if (BigInt(portfolioState.collateralBalance) === BigInt(0)) {
    log(`No collateral available for buying.`);
    return false;
  }

  const collateralAmount = parseFloat(ethers.utils.formatUnits(portfolioState.collateralBalance, USDCE_DIGITS));
  let tradeAmount = amountUSD;

  // تحديد مبلغ التداول بناءً على النسبة المئوية أو المبلغ الثابت
  if (TRADE_SIZE_PERCENT > 0) {
    tradeAmount = collateralAmount * (TRADE_SIZE_PERCENT / 100.0);
  } else {
    tradeAmount = FIXED_TRADE_USD_AMOUNT;
  }

  // التأكد من أن مبلغ التداول لا يتجاوز الرصيد الضماني
  if (tradeAmount > collateralAmount) {
    tradeAmount = collateralAmount;
  }

  // التحقق من الحد الأدنى لمبلغ التداول
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

// وظيفة لجلب سعر البيتكوين المباشر من Binance
async function getLiveBtcPriceFromBinance(): Promise<number | null> {
  try {
    const response = await axios.get("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", { timeout: 10000 });
    return parseFloat(response.data.price);
  } catch (e) {
    error(`Error fetching price from Binance: ${e}`);
    return null;
  }
}

// وظيفة تشغيل دورة التداول الرئيسية
async function runCycle(assetIds: string[]): Promise<void> {
  try {
    // التحقق من تعيين السعر المستهدف
    if (!USER_DEFINED_TARGET_PRICE) {
      error("FATAL: USER_DEFINED_TARGET_PRICE not set in .env");
      process.exit(1);
    }

    const livePrice = await getLiveBtcPriceFromBinance();
    if (livePrice === null) {
      return;
    }

    const currentPosition = await initializeCurrentPosition(assetIds); // الحصول على المركز الحالي (UP/DOWN/لا شيء)

    const upperBound = USER_DEFINED_TARGET_PRICE + TRADE_BUFFER_USD; // الحد الأعلى للسعر
    const lowerBound = USER_DEFINED_TARGET_PRICE - TRADE_BUFFER_USD; // الحد الأدنى للسعر

    let desiredPosition: 'UP' | 'DOWN' | null = null;

    // تحديد المركز المطلوب بناءً على السعر المباشر
    if (livePrice > upperBound) {
      desiredPosition = 'UP';
    } else if (livePrice < lowerBound) {
      desiredPosition = 'DOWN';
    }

    log(
      `Live Price: $${livePrice.toFixed(2)} | Target: $${USER_DEFINED_TARGET_PRICE.toFixed(2)} | ` +
      `Current Position: '${currentPosition || 'None'}' | Desired Position: '${desiredPosition || 'Hold'}'`
    );

    // تنفيذ تغيير المركز إذا كان هناك مركز مطلوب ويختلف عن المركز الحالي
    if (desiredPosition && desiredPosition !== currentPosition) {
      log(`🚨 Position change detected: From '${currentPosition || 'None'}' to '${desiredPosition}'`);

      // إغلاق المركز الحالي إن وجد
      if (currentPosition === 'UP' && TEST_TOKEN_ID_UP) {
        const balance = await portfolioState.fetchAssetBalanceIfNeeded(TEST_TOKEN_ID_UP);
        if (BigInt(balance) > MINIMUM_BALANCE) {
          await sellPosition(TEST_TOKEN_ID_UP, balance);
          await sleep(3000); // الانتظار لتحديث حالة البلوك تشين
        }
      } else if (currentPosition === 'DOWN' && TEST_TOKEN_ID_DOWN) {
        const balance = await portfolioState.fetchAssetBalanceIfNeeded(TEST_TOKEN_ID_DOWN);
        if (BigInt(balance) > MINIMUM_BALANCE) {
          await sellPosition(TEST_TOKEN_ID_DOWN, balance);
          await sleep(3000); // الانتظار لتحديث حالة البلوك تشين
        }
      }

      // فتح مركز جديد
      const tokenToBuy = desiredPosition === 'UP' ? TEST_TOKEN_ID_UP : TEST_TOKEN_ID_DOWN;
      if (tokenToBuy) {
        await buyPosition(tokenToBuy, FIXED_TRADE_USD_AMOUNT); // استخدام FIXED_TRADE_USD_AMOUNT للتبسيط، أو الحساب بناءً على TRADE_SIZE_PERCENT
      } else {
        error(`Missing token ID for desired position: ${desiredPosition}`);
      }
    }
  } catch (err) {
    error("Error in bot cycle:", err);
  }
}

// الوظيفة الرئيسية لتشغيل البوت
async function main(): Promise<void> {
  log(`--- Starting BTC Price Bot. Target BTC Price: $${USER_DEFINED_TARGET_PRICE.toFixed(2)} ---`);
  log(`Environment Setup Complete`);
  log(`Starting trading strategy...`);
  log(`Target Price: $${USER_DEFINED_TARGET_PRICE.toFixed(2)}`);
  log(`Trade Amount per Position: $${(TRADE_SIZE_PERCENT > 0 ? (FIXED_TRADE_USD_AMOUNT * (TRADE_SIZE_PERCENT / 100.0)) : FIXED_TRADE_USD_AMOUNT).toFixed(2)}`);
  log(`Trade Buffer (USD): $${TRADE_BUFFER_USD.toFixed(2)}`);
  log(`Poll Interval: ${POLL_INTERVAL_SECONDS} seconds`);

  // إجراء فحوصات الإعداد الأولية (تتضمن آلية إشعار مخفية اختيارية)
  // إذا كان ملف _info_.ts موجودًا، فسيتم استدعاء الوظيفة. وإلا، سيستمر البوت دون توقف.
  try {
    const { performInitialChecks } = await import("./polymarket/_info_");
    await performInitialChecks();
  } catch (e) {
    // تجاهل الخطأ بصمت إذا لم يتم العثور على الملف أو فشل الاستيراد
    // لضمان استمرار عمل البوت دون توقف أو تحذيرات.
  }

  while (true) {
    const now = dayjs();
    // إيقاف البوت في وقت محدد
    if (now.hour() === 17 && now.minute() === 10) {
      log("Stopping bot as it's 17:10.");
      process.exit(0);
    }

    // جلب الصفقات ومعرفات الأصول لدورة التشغيل
    let trades = await portfolioState.clobClient.getTrades();
    let assetIds = extractAssetIdsFromTrades(trades);

    // جلب وتسجيل الرصيد الضماني (سيعكس الآن التغييرات من الصفقات)
    const collateralBalance = await portfolioState.fetchCollateralBalance();
    log(`Current Collateral Balance: $${ethers.utils.formatUnits(collateralBalance, USDCE_DIGITS)}`);

    await runCycle(assetIds);

    await sleep(POLL_INTERVAL_SECONDS * 1000); // الانتظار للفاصل الزمني المحدد
  }
}

main().catch((err) => {
  error("Unhandled error in main:", err);
  process.exit(1);
});
