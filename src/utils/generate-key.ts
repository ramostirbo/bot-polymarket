import "@dotenvx/dotenvx/config";
import { Wallet } from "@ethersproject/wallet";
import { log } from "console";
import { getClobClient, getWallet } from "./web3";
import * as fs from "fs";
import * as path from "path";

const wallet = process.env.PK
  ? getWallet(process.env.PK)
  : Wallet.createRandom();
const clobClient = getClobClient(wallet);
const polymarketApi = await clobClient.createOrDeriveApiKey();

log("🔑 New Ethereum Wallet Generated:");
log("----------------------------------");
log(`Address:       ${wallet.address}`);
log(`Mnemonic:      ${wallet.mnemonic?.phrase}`);
log(`PK=${process.env.PK || wallet.privateKey}`);
log(`CLOB_API_KEY=${polymarketApi.key}`);
log(`CLOB_SECRET=${polymarketApi.secret}`);
log(`CLOB_PASS_PHRASE=${polymarketApi.passphrase}`);

const envPath = path.resolve(process.cwd(), ".env");
const envContent = fs.readFileSync(envPath, "utf8");

let updatedEnvContent = envContent;

// Replace PK
if (!process.env.PK) {
  updatedEnvContent = updatedEnvContent.replace(/PK=''(.*)/, `PK='${wallet.privateKey}'$1`);
}

// Replace CLOB API Credentials
updatedEnvContent = updatedEnvContent.replace(/CLOB_API_KEY=''(.*)/, `CLOB_API_KEY='${polymarketApi.key}'$1`);
updatedEnvContent = updatedEnvContent.replace(/CLOB_SECRET=''(.*)/, `CLOB_SECRET='${polymarketApi.secret}'$1`);
updatedEnvContent = updatedEnvContent.replace(/CLOB_PASS_PHRASE=''(.*)/, `CLOB_PASS_PHRASE='${polymarketApi.passphrase}'$1`);

try {
  fs.writeFileSync(envPath, updatedEnvContent);
  log("\n✅ Keys successfully added to .env file.");
} catch (error: unknown) {
  log(`\n❌ Failed to write to .env file: ${(error as Error).message}`);
}
