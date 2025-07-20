# مشروع Polybot - روبوت تداول أسعار البيتكوين

هذا المشروع هو تطبيق Node.js (باستخدام Bun) مصمم للتداول الآلي لأسعار البيتكوين (BTC) على منصة Polymarket. يركز فقط على تنفيذ الصفقات بناءً على أسعار مستهدفة محددة مسبقًا.

## المتطلبات المسبقة

قبل البدء، تأكد من تثبيت المتطلبات التالية على نظامك:

*   **Bun**: بيئة تشغيل JavaScript سريعة. يمكنك تثبيتها من [هنا](https://bun.sh/).
*   **Alchemy RPC Token**: مطلوب للتفاعل مع شبكة Polygon. يمكنك الحصول عليه من [Alchemy](https://www.alchemy.com/).
*   **المفتاح الخاص لمحفظة Ethereum (PK)**: ستحتاج إلى المفتاح الخاص من محفظة Ethereum الخاصة بك (مثل MetaMask أو Phantom).
*   **حساب Polymarket**: يجب أن يكون لديك حساب Polymarket نشط.

## الإعداد

اتبع هذه الخطوات لإعداد المشروع وتشغيله:

### 1. استنساخ المستودع وتثبيت التبعيات

افتح الطرفية وانتقل إلى دليل المشروع:

```bash
git clone https://github.com/ramostirbo/bot-poly-pro.git
cd bot-poly-pro
bun install
```

### 2. إعداد ملف `.env`

قم بإنشاء ملف يسمى `.env` في الدليل الجذر للمشروع. قم بملئه ببيانات الاعتماد والإعدادات الخاصة بك.

```
PK= # المفتاح الخاص لمحفظة Ethereum الخاصة بك (مثال: 9e851d8eb700...)
ALCHEMY_API_KEY= # مفتاح Alchemy API الخاص بك (مثال: enjEwLoAqBSTy0-K0jx5i)

# --- بيانات اعتماد CLOB API (احصل عليها من Polymarket أو عبر العميل الخاص بهم) ---
CLOB_API_KEY=
CLOB_SECRET=
CLOB_PASS_PHRASE=
POLYMARKET_FUNDER_ADDRESS= # عنوان محفظة Polymarket الداخلية الخاصة بك (لجلب بيانات الحساب)

# --- إعدادات عامة لاستراتيجية BTC ---
HOST=https://api.polymarket.com
CHAIN_ID=137 # 137 لشبكة Polygon الرئيسية
PROXY_WALLET_ADDRESS= # عنوان محفظة Polymarket الداخلية الخاصة بك (لجلب بيانات الحساب)

# إعدادات استراتيجية BTC
USER_DEFINED_TARGET_PRICE=118701.94 # السعر المستهدف للبيتكوين (مثال: 118040.37)
TRADE_BUFFER_USD=10.0 # الهامش حول السعر المستهدف (مثال: 100 دولار)
POLL_INTERVAL_SECONDS=15 # الفاصل الزمني بين عمليات فحص السعر (بالثواني)

# معرفات رموز Polymarket (يجب أن تكون معرفات الرموز المميزة لأسواق "BTC UP" و "BTC DOWN" الخاصة بك)
POLYMARKET_MARKET_ID=
TEST_TOKEN_ID_UP=
TEST_TOKEN_ID_DOWN=

# إعدادات حجم التداول
TRADE_SIZE_PERCENT=0 # نسبة مئوية من الرصيد للتداول (0 لتعطيل)
FIXED_TRADE_USD_AMOUNT=3 # مبلغ USD ثابت للتداول (إذا كان TRADE_SIZE_PERCENT=0)
MIN_TRADE_AMOUNT_USD=2 # الحد الأدنى لمبلغ التداول بالدولار الأمريكي
```

**ملاحظات هامة لملف `.env`:**

*   **`PK`**: قم بتصدير المفتاح الخاص من محفظة Ethereum الخاصة بك (مثل MetaMask أو Phantom) وقم بتعيينه هنا.
*   **`POLYMARKET_FUNDER_ADDRESS`**: قم بربط محفظتك بـ Polymarket للحصول على عنوان محفظتهم الداخلية، ثم قم بتعيينه هنا.
*   **`POLYMARKET_MARKET_ID`, `TEST_TOKEN_ID_UP`, `TEST_TOKEN_ID_DOWN`**: ستحصل على هذه القيم من سوق بيتكوين معين على Polymarket. على سبيل المثال، إذا كان سوقك هو "Bitcoin Up or Down on July 20?"، فستكون القيم:
    ```
    POLYMARKET_MARKET_ID=564772
    TEST_TOKEN_ID_UP=47693707782708344709933379717282479040679001662901559825677909765209892024218
    TEST_TOKEN_ID_DOWN=90448057690772865185997500474152512089394118479294441369918586912408601370906
    ```
    قم بتحديث هذه القيم في ملف `.env` الخاص بك.

### 3. بناء المشروع

قم بتجميع ملفات TypeScript إلى JavaScript:

```bash
bun build src/llm-bot.ts --outdir=dist --target=bun
```

### 4. تشغيل البوت

الآن يمكنك تشغيل روبوت تداول أسعار البيتكوين الرئيسي:

```bash
bun run src/llm-bot.ts
```

سيبدأ البوت في مراقبة سعر البيتكوين وتنفيذ الصفقات على Polymarket بناءً على استراتيجيتك المكونة.
