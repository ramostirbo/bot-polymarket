# مشروع Polybot

هذا المشروع هو تطبيق Node.js (باستخدام Bun) مصمم للتفاعل مع منصة Polymarket و LLM Arena. يتضمن روبوت تداول آلي لـ Polymarket وجامع بيانات للوحة المتصدرين لـ LLM Arena.

## المتطلبات المسبقة

قبل البدء، تأكد من تثبيت المتطلبات التالية على نظامك:

*   **Bun**: بيئة تشغيل JavaScript سريعة. يمكنك تثبيتها من [هنا](https://bun.sh/).
*   **PostgreSQL**: قاعدة بيانات علائقية. تأكد من أنها تعمل ويمكن الوصول إليها على `localhost:5432`.
*   **Alchemy RPC Token**: مطلوب للتفاعل مع شبكة Polygon. يمكنك الحصول عليه من [Alchemy](https://www.alchemy.com/) (بعد تسجيل الدخول، ابحث عن "Account Kit Quickstart" وانتقل إلى علامة التبويب "Networks" لتمكين شبكة Polygon والحصول على الرمز المميز).
*   **محفظة Ethereum (Phantom/MetaMask)**: ستحتاج إلى محفظة لتصدير المفتاح الخاص الخاص بك.
*   **حساب Polymarket**: يجب أن يكون لديك حساب Polymarket نشط.

## الإعداد

اتبع هذه الخطوات لإعداد المشروع وتشغيله:

### 1. استنساخ المستودع وتثبيت التبعيات

افتح الطرفية وانتقل إلى دليل المشروع:

```bash
git clone https://github.com/0-don/polybot.git
cd polybot
bun install
```

### 2. إعداد ملف `.env`

قم بإنشاء ملف يسمى `.env` في الدليل الجذر للمشروع. يمكنك نسخ المحتوى من `env.example` أو استخدام المحتوى التالي وتعبئة القيم:

```
POSTGRES_DB=chaindesk
POSTGRES_USER=admin
POSTGRES_PASSWORD=123456 # تم تغييرها إلى كلمة مرور بسيطة
POSTGRES_HOST=localhost:5432
DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}/${POSTGRES_DB}

PK= # المفتاح الخاص لمحفظة Ethereum الخاصة بك (مثال: 9e851d8eb700...)
ALCHEMY_API_KEY= # مفتاح Alchemy API الخاص بك (مثال: enjEwLoAqBSTy0-K0jx5i)

# --- بيانات اعتماد CLOB API (احصل عليها من Polymarket أو عبر العميل) ---
CLOB_API_KEY=
CLOB_SECRET=
CLOB_PASS_PHRASE=
POLYMARKET_FUNDER_ADDRESS= # عنوان محفظة Polymarket الداخلية الخاصة بك (لجلب بيانات الحساب)

# --- إعدادات عامة لاستراتيجية BTC ---
DRY_RUN=True # اجعلها False للتداول الحقيقي. True للتشغيل التجريبي.
HOST=https://api.polymarket.com
CHAIN_ID=137 # 137 لشبكة Polygon الرئيسية
PROXY_WALLET_ADDRESS= # عنوان محفظة Polymarket الداخلية الخاصة بك (لجلب بيانات الحساب)

# إعدادات استراتيجية BTC
USER_DEFINED_TARGET_PRICE=118040.37 # السعر المستهدف للبيتكوين (مثال: 118040.37)
TRADE_BUFFER_USD=10.0 # الهامش حول السعر المستهدف (مثال: 100 دولار)
POLL_INTERVAL_SECONDS=5 # الفاصل الزمني بين عمليات فحص السعر (بالثواني)

# معرفات رموز Polymarket (يجب أن تكون معرفات الرموز المميزة لأسواق "BTC UP" و "BTC DOWN" الخاصة بك)
POLYMARKET_MARKET_ID=
TEST_TOKEN_ID_UP=
TEST_TOKEN_ID_DOWN=

# إعدادات حجم التداول
SIMULATED_ACCOUNT_BALANCE=1000 # الرصيد الأولي للحساب المحاكي (فقط إذا كان DRY_RUN=True)
TRADE_SIZE_PERCENT=0 # نسبة مئوية من الرصيد للتداول (0 لتعطيل)
FIXED_TRADE_USD_AMOUNT=10 # مبلغ USD ثابت للتداول (إذا كان TRADE_SIZE_PERCENT=0)
MIN_TRADE_AMOUNT_USD=3.0 # الحد الأدنى لمبلغ التداول بالدولار الأمريكي

# أسعار الأوامر (عادةً ما تكون قريبة من 1.00 لـ BUY و 0.00 لـ SELL)
ORDER_PRICE_BUY=0.98
ORDER_PRICE_SELL=0.02
```

**ملاحظات هامة لملف `.env`:**

*   **`PK`**: قم بتصدير المفتاح الخاص من محفظة Ethereum الخاصة بك (مثل MetaMask أو Phantom) وقم بتعيينه هنا.
*   **`POLYMARKET_FUNDER_ADDRESS`**: قم بربط محفظتك بـ Polymarket للحصول على عنوان محفظتهم الداخلية، ثم قم بتعيينه هنا.
*   **`POLYMARKET_MARKET_ID`, `TEST_TOKEN_ID_UP`, `TEST_TOKEN_ID_DOWN`**: ستحصل على هذه القيم في خطوة لاحقة.

### 3. إعداد قاعدة البيانات PostgreSQL

إذا لم يكن مستخدم `admin` لديه امتيازات `SUPERUSER` أو إذا كانت كلمة المرور تحتوي على أحرف خاصة، اتبع هذه الخطوات:

1.  **تغيير كلمة مرور مستخدم `admin` (إذا لزم الأمر)**:
    *   اتصل بـ `psql` باستخدام كلمة المرور القديمة (إذا كانت موجودة):
        ```bash
        psql -h localhost -p 5432 -U admin -d chaindesk
        ```
        عندما يُطلب منك كلمة المرور، أدخل كلمة المرور القديمة.
    *   بمجرد الاتصال بنجاح (سترى `chaindesk=>`)، قم بتنفيذ الأمر التالي داخل موجه `psql`:
        ```sql
        ALTER USER admin WITH PASSWORD '123456';
        ```
    *   اكتب `\q` للخروج من `psql`.

2.  **منح امتيازات `SUPERUSER` لمستخدم `admin`**:
    *   اتصل بـ `psql` كمستخدم لديه امتيازات `SUPERUSER` (عادةً المستخدم الافتراضي `postgres`):
        ```bash
        psql -U postgres -d chaindesk
        ```
        (قد تحتاج إلى إدخال كلمة مرور المستخدم `postgres` إذا كانت موجودة).
    *   بمجرد الاتصال بنجاح، قم بتنفيذ الأمر التالي داخل موجه `psql`:
        ```sql
        ALTER ROLE admin WITH SUPERUSER;
        ```
    *   اكتب `\q` للخروج من `psql`.

3.  **إعادة تعيين وترحيل قاعدة البيانات**:
    ```bash
    bun drizzle
    ```

### 4. بناء المشروع

قم بتجميع ملفات TypeScript إلى JavaScript:

```bash
bun build src/llm-bot.ts --outdir=dist --target=bun
bun build src/markets.ts --outdir=dist --target=bun
bun build src/llm-leaderboard.ts --outdir=dist --target=bun
bun build src/llm-leaderboard-new.ts --outdir=dist --target=bun
# ملاحظة: تم تخطي بناء src/twitter-bot.ts لأنه غير موجود في المشروع الحالي.
```

### 5. توليد مفاتيح API لـ Polymarket

هذه الخطوة ضرورية للتفاعل مع Polymarket.

```bash
bun run src/utils/generate-key.ts
```

**ملاحظة هامة**: قد يظهر خطأ "Could not create api key" إذا لم يكن `PK` أو `POLYMARKET_FUNDER_ADDRESS` مرتبطين بشكل صحيح بحساب Polymarket لديه أذونات توليد المفاتيح. تأكد من صحة إعداد حسابك على Polymarket.

**بعد تشغيل الأمر، ستظهر لك مفاتيح `CLOB_API_KEY` و `CLOB_SECRET` و `CLOB_PASS_PHRASE` في الإخراج. قم بنسخ هذه المفاتيح ولصقها في ملف `.env` الخاص بك.**

### 6. تغذية قاعدة البيانات ببيانات السوق الأولية

بعد تحديث ملف `.env` بمفاتيح API، قم بتغذية قاعدة البيانات ببيانات السوق من Polymarket:

```bash
bun markets
```
هذا الأمر سيستمر في العمل في الخلفية لتحديث بيانات السوق.

### 7. تشغيل البوتات

الآن يمكنك تشغيل المكونات الرئيسية للمشروع:

*   **لتشغيل روبوت تداول البيتكوين (BTC Price Bot)**:
    ```bash
    bun start-llm-bot
    ```
    **ملاحظة**: إذا ظهرت رسالة "Missing token ID for desired position"، فهذا يعني أن `POLYMARKET_MARKET_ID` و `TEST_TOKEN_ID_UP` و `TEST_TOKEN_ID_DOWN` لم يتم تعيينها بعد في ملف `.env`. ستحتاج إلى العثور على هذه المعرفات من سوق بيتكوين معين على Polymarket وتحديث ملف `.env` الخاص بك. على سبيل المثال، إذا كان سوقك هو "Bitcoin Up or Down on July 20?"، فستكون القيم:
    ```
    POLYMARKET_MARKET_ID=564772
    TEST_TOKEN_ID_UP=47693707782708344709933379717282479040679001662901559825677909765209892024218
    TEST_TOKEN_ID_DOWN=90448057690772865185997500474152512089394118479294441369918586912408601370906
    ```
    بعد تحديثها، أعد تشغيل `bun start-llm-bot`.

*   **لتشغيل مزامنة بيانات السوق المستمرة (إذا لم تكن تعمل بالفعل)**:
    ```bash
    bun start-markets
    ```

*   **لتشغيل جامع بيانات لوحة المتصدرين لـ LLM Arena**:
    ```bash
    bun start-llm-leaderboard
    ```
    أو
    ```bash
    bun start-llm-leaderboard-new
