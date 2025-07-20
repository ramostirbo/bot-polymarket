import { error, log } from "console";
import type { Market } from "../types/markets";
import { portfolioState } from "../utils/portfolio-state";
import { sleep } from "../utils/retry";
import { getClobClient, getWallet } from "../utils/web3";
import { USDCE_DIGITS } from "./constants";
import { redeem } from "./redeem";

const wallet = getWallet(process.env.PK);
const clobClient = getClobClient(wallet);

// Rate limiting: 60 requests per 10 seconds = 6 requests per second max
// We'll be more conservative: 4 requests per second = 250ms between requests
const RATE_LIMIT_DELAY = 250;

function safeAtob(cursor: string): string {
  try {
    return atob(cursor);
  } catch (err) {
    log(`Warning: Could not decode cursor "${cursor}", using as-is`);
    return cursor;
  }
}

// Simple retry only for API calls that might hit rate limits
async function apiCallWithRetry<T>(
  apiCall: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (err) {
      const isRateLimit =
        (err as Error)?.message?.includes("429") ||
        (err as Error)?.message?.includes("Too Many Requests");

      if (isRateLimit && attempt < maxRetries - 1) {
        const waitTime = 15000; // 15 seconds for rate limits
        log(
          `Rate limit hit, waiting ${waitTime / 1000}s before retry ${
            attempt + 2
          }/${maxRetries}...`
        );
        await sleep(waitTime);
        continue;
      }

      if (attempt === maxRetries - 1) {
        throw err; // Last attempt, throw the error
      }

      // For other errors, shorter retry delay
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error("Should not reach here");
}

export async function getAllMarkets(): Promise<Market[]> {
  const allMarkets = [];
  let nextCursor = "MA==";
  let requestCount = 0;
  const startTime = Date.now();

  while (nextCursor !== "LTE=") {
    try {
      // Rate limiting: ensure we don't exceed 4 requests per second
      if (requestCount > 0) {
        await sleep(RATE_LIMIT_DELAY);
      }

      // Only retry the API call, not the whole loop logic
      const response = await apiCallWithRetry(async () => {
        const result = await clobClient.getMarkets(nextCursor);
        if (!result.data) {
          throw new Error("No data in response from getMarkets");
        }
        return result;
      });

      allMarkets.push(...response.data);
      nextCursor = response.next_cursor;
      requestCount++;

      const decodedCursor = safeAtob(nextCursor);
      log(
        `Fetched ${
          response.data?.length || 0
        } markets, next cursor: ${decodedCursor} (total: ${allMarkets.length})`
      );

      // Log progress every 50 requests
      if (requestCount % 50 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = requestCount / elapsed;
        log(
          `Progress: ${requestCount} requests in ${elapsed.toFixed(
            1
          )}s (${rate.toFixed(2)} req/s)`
        );
      }
    } catch (err) {
      // Check if it's the cursor decoding error
      if (err instanceof DOMException && err.name === "InvalidCharacterError") {
        log(`Cursor decoding failed for "${nextCursor}", stopping fetch`);
        break;
      }

      error("Error fetching markets after retries:", err);
      break;
    }
  }

  log(
    `Finished fetching ${allMarkets.length} total markets in ${requestCount} requests`
  );
  return allMarkets;
}
