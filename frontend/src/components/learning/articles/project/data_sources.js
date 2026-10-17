// Article: Data sources — connect and configure (backend/providers/*,
// Settings → DATA SOURCES).
// Rule for Arabic body: keep every technical term in English (API token,
// paper account, futures, CSV, etc.). Surrounding prose is simplified Arabic.

export default {
  id: "data_sources",
  category: "project",
  order: 0.35,
  title: {
    en: "Data sources: connect and configure",
    ar: "مصادر البيانات: الربط والإعداد",
  },
  tags: ["data source", "feed", "yahoo", "binance", "oanda", "alpaca", "csv", "paper trading", "commodities",
         "api key", "token", "مصدر بيانات", "سلع", "تداول ورقي"],
  summary: {
    en: "Run the terminal on live prices from MetaTrader 5, Yahoo Finance, Binance, OANDA or Alpaca, or on your own CSV files, and practise on any of them with a paper account. Pick a source in ⚙ Settings → DATA SOURCES.",
    ar: "شغّل المنصة على أسعار حية من MetaTrader 5 أو Yahoo Finance أو Binance أو OANDA أو Alpaca، أو على ملفات CSV خاصة بك، وتدرّب على أي منها بحساب ورقي (paper account). اختر المصدر من ⚙ Settings ← DATA SOURCES.",
  },
  sections: [
    {
      heading: { en: "Data source and execution account", ar: "مصدر البيانات وحساب التنفيذ" },
      paragraphs: [
        {
          en: "These are two separate choices. The data source delivers the prices behind the charts, the cones and bands, the Pulse Room and the Replay page. The execution account receives your orders. MetaTrader 5 and OANDA can do both. Yahoo Finance, Binance, Alpaca and CSV files only deliver prices, so their orders go to the paper account, which fills them at that source's live bid and ask.",
          ar: "هذان اختياران منفصلان. مصدر البيانات يقدّم الأسعار التي تُبنى عليها الشارتات والـ cones والـ bands وPulse Room وصفحة Replay. أما حساب التنفيذ فهو الذي يستقبل أوامرك. يستطيع MetaTrader 5 وOANDA القيام بالأمرين معاً. أما Yahoo Finance وBinance وAlpaca وملفات CSV فتقدّم الأسعار فقط، لذلك تذهب أوامرها إلى الـ paper account الذي ينفّذها بأسعار bid وask الحية لذلك المصدر.",
        },
        {
          en: "The header always shows the active source: MT5 ● LINKED, FEED ● SIMULATED, or FEED ● YAHOO (or BINANCE, OANDA, ALPACA, CSV). Hover over it for the full name.",
          ar: "يعرض أعلى المنصة المصدر النشط دائماً: MT5 ● LINKED أو FEED ● SIMULATED أو FEED ● YAHOO (أو BINANCE أو OANDA أو ALPACA أو CSV). مرّر المؤشر فوقه لترى الاسم الكامل.",
        },
      ],
    },
    {
      heading: { en: "Switching sources", ar: "تبديل المصدر" },
      bullets: [
        {
          en: "Open ⚙ Settings → DATA SOURCES. Each card says what the source covers and what it needs.",
          ar: "افتح ⚙ Settings ← DATA SOURCES. كل بطاقة توضّح ما يغطيه المصدر وما يحتاجه.",
        },
        {
          en: "SETTINGS opens the source's fields, and SAVE keeps them in user_config.json on this computer.",
          ar: "زر SETTINGS يفتح حقول المصدر، وزر SAVE يحفظها في ملف user_config.json على جهازك فقط.",
        },
        {
          en: "TEST connects with those settings and fetches one quote, without changing anything.",
          ar: "زر TEST يتصل بهذه الإعدادات ويجلب سعراً واحداً للتجربة، بدون تغيير أي شيء.",
        },
        {
          en: "USE makes it the data source. The terminal reconnects and the page reloads. Cones and bands are then rebuilt from the new source's daily bars within a minute or two. RECONNECT on the active source applies changed settings.",
          ar: "زر USE يجعله مصدر البيانات: تعيد المنصة الاتصال وتُعاد تحميل الصفحة. بعدها تُبنى الـ cones والـ bands من جديد من الشموع اليومية للمصدر الجديد خلال دقيقة أو دقيقتين. وزر RECONNECT على المصدر النشط يطبّق الإعدادات بعد تعديلها.",
        },
        {
          en: "ORDERS GO TO, at the top of the section, picks the execution account.",
          ar: "قائمة ORDERS GO TO أعلى القسم تحدد حساب التنفيذ.",
        },
        {
          en: "From the command line, python launcher.py --provider yahoo uses a source for one run (also binance, oanda, alpaca, csv, sim or mt5). Choosing a source in Settings replaces it until the next start.",
          ar: "من سطر الأوامر: python launcher.py --provider yahoo يستخدم مصدراً لهذا التشغيل فقط (وكذلك binance أو oanda أو alpaca أو csv أو sim أو mt5). واختيار مصدر من الإعدادات يحلّ محله حتى التشغيل التالي.",
        },
      ],
    },
    {
      heading: { en: "Which source for which market", ar: "أي مصدر لأي سوق" },
      bullets: [
        {
          en: "Forex: MetaTrader 5 or OANDA (real time), or Yahoo Finance (free).",
          ar: "العملات (Forex): MetaTrader 5 أو OANDA (لحظياً)، أو Yahoo Finance (مجاناً).",
        },
        {
          en: "Gold, silver, platinum, oil, natural gas and copper: MetaTrader 5 and OANDA quote spot or CFD prices. Yahoo Finance quotes the front-month futures (GC=F, SI=F, PL=F, CL=F, BZ=F, NG=F, HG=F).",
          ar: "الذهب والفضة والبلاتين والنفط والغاز الطبيعي والنحاس: يقدّم MetaTrader 5 وOANDA أسعار spot أو CFD، بينما يقدّم Yahoo Finance أسعار عقد الـ futures الأقرب (GC=F وSI=F وPL=F وCL=F وBZ=F وNG=F وHG=F).",
        },
        {
          en: "Grains, softs and livestock: Yahoo Finance futures for corn (ZC=F), wheat (ZW=F), soybeans (ZS=F), coffee (KC=F), sugar (SB=F), cocoa (CC=F), cotton (CT=F) and live cattle (LE=F). OANDA has corn, wheat, soybeans and sugar.",
          ar: "الحبوب والسلع الطرية والمواشي: عقود futures من Yahoo Finance للذرة (ZC=F) والقمح (ZW=F) وفول الصويا (ZS=F) والقهوة (KC=F) والسكر (SB=F) والكاكاو (CC=F) والقطن (CT=F) والماشية (LE=F). ويقدّم OANDA الذرة والقمح وفول الصويا والسكر.",
        },
        {
          en: "Indices: MetaTrader 5 and OANDA (CFDs), or Yahoo Finance (ES=F, NQ=F, YM=F, RTY=F futures, and ^GDAXI, ^FTSE, ^N225).",
          ar: "المؤشرات: MetaTrader 5 وOANDA (عقود CFD)، أو Yahoo Finance (عقود ES=F وNQ=F وYM=F وRTY=F، والمؤشرات ^GDAXI و^FTSE و^N225).",
        },
        {
          en: "Crypto: Binance (real time, free), Alpaca, or Yahoo Finance.",
          ar: "العملات الرقمية: Binance (لحظياً ومجاناً)، أو Alpaca، أو Yahoo Finance.",
        },
        {
          en: "US stocks and ETFs, including commodity ETFs such as GLD, SLV, USO, UNG and CPER: Alpaca (real time) or Yahoo Finance.",
          ar: "الأسهم وصناديق ETF الأمريكية، ومنها صناديق السلع مثل GLD وSLV وUSO وUNG وCPER: من Alpaca (لحظياً) أو Yahoo Finance.",
        },
        {
          en: "Anything else, or data from a paid vendor: export it to CSV files.",
          ar: "أي سوق آخر، أو بيانات من مزوّد مدفوع: صدّرها إلى ملفات CSV.",
        },
      ],
    },
    {
      heading: { en: "Yahoo Finance: free, no account", ar: "Yahoo Finance: مجاني وبدون حساب" },
      bullets: [
        {
          en: "Needs only an internet connection. Quotes refresh every 30 seconds (Quote refresh), taken from the latest minute bar. Refreshing more often risks Yahoo's rate limit.",
          ar: "يحتاج اتصالاً بالإنترنت فقط. تتحدث الأسعار كل 30 ثانية (Quote refresh)، وتؤخذ من آخر شمعة دقيقة. والتحديث الأسرع قد يتجاوز حدود الطلبات لدى Yahoo.",
        },
        {
          en: "A quote is the last trade price, so bid equals ask: paper orders on Yahoo Finance fill without a spread.",
          ar: "السعر هو سعر آخر صفقة، فيتساوى bid وask، لذلك تُنفَّذ أوامر الـ paper account على Yahoo Finance دون spread.",
        },
        {
          en: "Some markets are delayed: futures by about 10 minutes, some exchanges by 15 to 20. That is fine for analysis, but not for fast trading.",
          ar: "بعض الأسواق متأخرة: عقود الـ futures بنحو 10 دقائق، وبعض البورصات بـ 15 إلى 20 دقيقة. هذا مناسب للتحليل لكنه غير مناسب للتداول السريع.",
        },
        {
          en: "Futures prices differ slightly from spot or CFD prices (GC=F is not exactly XAUUSD). Compare levels within one source only.",
          ar: "أسعار الـ futures تختلف قليلاً عن أسعار spot أو CFD (فـ GC=F ليس XAUUSD تماماً)، لذلك قارن المستويات داخل المصدر نفسه فقط.",
        },
        {
          en: "History: about 7 days of 1-minute bars, 60 days of 5-to-30-minute bars, 2 years of hourly bars, and decades of daily bars.",
          ar: "التاريخ المتاح: نحو 7 أيام من شموع الدقيقة، و60 يوماً من شموع 5 إلى 30 دقيقة، وسنتان من شموع الساعة، وعقود من الشموع اليومية.",
        },
      ],
    },
    {
      heading: { en: "Binance: crypto in real time", ar: "Binance: العملات الرقمية لحظياً" },
      bullets: [
        {
          en: "Free and needs no account. BTCUSD is read as BTCUSDT; change Quote asset to USDC or FDUSD if you prefer.",
          ar: "مجاني ولا يحتاج حساباً. يُقرأ BTCUSD على أنه BTCUSDT، ويمكنك تغيير Quote asset إلى USDC أو FDUSD.",
        },
        {
          en: "If api.binance.com is not reachable where you are (in the US, for example), pick https://api.binance.us or the market-data-only address https://data-api.binance.vision as the API address.",
          ar: "إذا لم يكن api.binance.com متاحاً في بلدك (في الولايات المتحدة مثلاً)، فاختر في API address العنوان https://api.binance.us أو عنوان بيانات السوق فقط https://data-api.binance.vision.",
        },
        {
          en: "Add tickers such as BTCUSD, ETHUSD or SOLUSD under UNIVERSE, with the CRYPTO class.",
          ar: "أضف رموزاً مثل BTCUSD أو ETHUSD أو SOLUSD من UNIVERSE مع التصنيف CRYPTO.",
        },
      ],
    },
    {
      heading: { en: "OANDA: forex and commodities, data and trading", ar: "OANDA: العملات والسلع، بيانات وتداول" },
      bullets: [
        {
          en: "1. Open a free practice account at oanda.com.",
          ar: "1. افتح حساباً تجريبياً مجانياً (practice) في موقع oanda.com.",
        },
        {
          en: "2. In the OANDA hub, open My Account → Manage API Access, generate a token and copy it.",
          ar: "2. من لوحة OANDA افتح My Account ← Manage API Access، ثم أنشئ token وانسخه.",
        },
        {
          en: "3. In Settings → DATA SOURCES → OANDA → SETTINGS, choose the practice environment, paste the token and leave Account ID empty to use your first account. Then press SAVE, TEST and USE.",
          ar: "3. من Settings ← DATA SOURCES ← OANDA ← SETTINGS اختر البيئة practice، والصق الـ token، واترك Account ID فارغاً لاستخدام حسابك الأول. ثم اضغط SAVE ثم TEST ثم USE.",
        },
        {
          en: "Orders then go to that OANDA account: a practice account trades no real money. Orders stay blocked until you switch LIVE TRADING on in Settings → TRADING.",
          ar: "بعدها تذهب الأوامر إلى حساب OANDA نفسه، والحساب التجريبي لا يستخدم أموالاً حقيقية. وتبقى الأوامر محظورة حتى تفعّل LIVE TRADING من Settings ← TRADING.",
        },
        {
          en: "Daily bars start at the 17:00 New York roll, as on MetaTrader 5 forex brokers.",
          ar: "الشموع اليومية تبدأ عند إغلاق نيويورك الساعة 17:00، كما عند وسطاء الفوركس على MetaTrader 5.",
        },
        {
          en: "Instead of typing the token, you can set the OANDA_TOKEN and OANDA_ACCOUNT_ID environment variables before starting.",
          ar: "بدلاً من كتابة الـ token في الإعدادات، يمكنك ضبط متغيرات البيئة OANDA_TOKEN وOANDA_ACCOUNT_ID قبل التشغيل.",
        },
      ],
    },
    {
      heading: { en: "Alpaca: US stocks, ETFs and crypto", ar: "Alpaca: الأسهم الأمريكية وصناديق ETF والعملات الرقمية" },
      bullets: [
        {
          en: "1. Create a free account at alpaca.markets; a paper-only account is enough.",
          ar: "1. أنشئ حساباً مجانياً في alpaca.markets، ويكفي حساب paper فقط.",
        },
        {
          en: "2. In the dashboard, generate an API key, then copy the key ID and the secret. The secret is shown only once.",
          ar: "2. من لوحة التحكم أنشئ API key، ثم انسخ الـ key ID والـ secret. الـ secret يظهر مرة واحدة فقط.",
        },
        {
          en: "3. Paste both into Settings → DATA SOURCES → Alpaca → SETTINGS. Feed iex is free; sip covers every US exchange and needs a paid plan. Then press SAVE, TEST and USE.",
          ar: "3. الصقهما في Settings ← DATA SOURCES ← Alpaca ← SETTINGS. الـ Feed المسمّى iex مجاني، أما sip فيغطي كل البورصات الأمريكية ويحتاج اشتراكاً مدفوعاً. ثم اضغط SAVE ثم TEST ثم USE.",
        },
        {
          en: "US stocks trade mainly from 9:30 to 16:00 New York time; crypto trades around the clock. Orders go to the paper account; the terminal sends no orders to Alpaca.",
          ar: "الأسهم الأمريكية تتداول أساساً من 9:30 إلى 16:00 بتوقيت نيويورك، والعملات الرقمية على مدار الساعة. تذهب الأوامر إلى الـ paper account، والمنصة لا ترسل أوامر إلى Alpaca.",
        },
        {
          en: "Environment variables: APCA_API_KEY_ID and APCA_API_SECRET_KEY.",
          ar: "متغيرات البيئة المقابلة: APCA_API_KEY_ID وAPCA_API_SECRET_KEY.",
        },
      ],
    },
    {
      heading: { en: "CSV files: your own data, offline", ar: "ملفات CSV: بياناتك الخاصة بدون إنترنت" },
      bullets: [
        {
          en: "Put the files in the CSV folder (default: the csv folder inside the app-data folder; on Windows %APPDATA%\\QuantumTerminal\\csv), named TICKER_TIMEFRAME.csv (XAUUSD_M15.csv, XAUUSD_D1.csv) or just TICKER.csv.",
          ar: "ضع الملفات في مجلد CSV (الافتراضي: مجلد csv داخل مجلد بيانات التطبيق، وفي Windows هو %APPDATA%\\QuantumTerminal\\csv)، وسمّها بالشكل TICKER_TIMEFRAME.csv (مثل XAUUSD_M15.csv وXAUUSD_D1.csv) أو TICKER.csv فقط.",
        },
        {
          en: "Columns: date and time (in one column or two), open, high, low, close, and optionally volume. Comma, semicolon or tab delimiters, most date formats and Unix time are all recognized, so exports from MetaTrader 5, TradingView or NinjaTrader work as they are.",
          ar: "الأعمدة: التاريخ والوقت (في عمود واحد أو عمودين)، ثم open وhigh وlow وclose، وvolume اختيارياً. تُكتشف الفاصلة أو الفاصلة المنقوطة أو الـ tab، ومعظم صيغ التاريخ وUnix time، لذلك تعمل ملفات التصدير من MetaTrader 5 أو TradingView أو NinjaTrader كما هي.",
        },
        {
          en: "A missing timeframe is built from a shorter one: H1 bars from M15, for example. For cones and bands, provide at least about a year of daily bars.",
          ar: "الإطار الزمني غير الموجود يُبنى من إطار أقصر منه، فمثلاً تُبنى شموع H1 من M15. ولحساب الـ cones والـ bands وفّر شموعاً يومية لسنة تقريباً على الأقل.",
        },
        {
          en: "The ticker must also be in your UNIVERSE list. The live price is the last close, so CSV files suit analysis and replays, not trading.",
          ar: "يجب أن يكون الرمز موجوداً أيضاً في قائمة UNIVERSE. والسعر الحالي هو آخر إغلاق في الملف، لذلك تناسب ملفات CSV التحليل والـ replay وليس التداول.",
        },
      ],
    },
    {
      heading: { en: "Ticker names on each source", ar: "أسماء الرموز في كل مصدر" },
      paragraphs: [
        {
          en: "The terminal uses one name per instrument (XAUUSD, US500, EURUSD), and each source translates it. XAUUSD is XAU_USD on OANDA and GC=F on Yahoo Finance. BTCUSD is BTCUSDT on Binance and BTC/USD on Alpaca.",
          ar: "تستخدم المنصة اسماً واحداً لكل أداة (مثل XAUUSD وUS500 وEURUSD)، وكل مصدر يترجمه إلى اسمه الخاص: فـ XAUUSD هو XAU_USD في OANDA وGC=F في Yahoo Finance، وBTCUSD هو BTCUSDT في Binance وBTC/USD في Alpaca.",
        },
      ],
      bullets: [
        {
          en: "If a ticker stays empty, the source doesn't know it by that name. Open UNIVERSE, click the ticker's broker symbol and type the source's name for it (for example ZO=F for oats on Yahoo Finance).",
          ar: "إذا بقي رمز فارغاً فهذا يعني أن المصدر لا يعرفه بهذا الاسم. افتح UNIVERSE واضغط على broker symbol للرمز، ثم اكتب اسمه في ذلك المصدر (مثلاً ZO=F للشوفان في Yahoo Finance).",
        },
        {
          en: "A mapping for one source only goes in user_config.json, under providers.accounts.<id>.symbols, for example \"symbols\": {\"US500\": \"SPX500_USD\"}.",
          ar: "لتعيين اسم لمصدر واحد فقط استخدم ملف user_config.json تحت providers.accounts.<id>.symbols، مثل \"symbols\": {\"US500\": \"SPX500_USD\"}.",
        },
        {
          en: "Add commodities under UNIVERSE with the CMDTY class: XAUUSD, XAGUSD, XTIUSD, XBRUSD, NATGAS, COPPER, CORN, WHEAT, SOYBEAN, COFFEE, SUGAR, COCOA and COTTON are recognized on Yahoo Finance as they are.",
          ar: "أضف السلع من UNIVERSE مع التصنيف CMDTY. الرموز XAUUSD وXAGUSD وXTIUSD وXBRUSD وNATGAS وCOPPER وCORN وWHEAT وSOYBEAN وCOFFEE وSUGAR وCOCOA وCOTTON يتعرّف عليها Yahoo Finance كما هي.",
        },
      ],
    },
    {
      heading: { en: "The paper account on live prices", ar: "الحساب الورقي على أسعار حية" },
      bullets: [
        {
          en: "It starts with 100,000 USD at 1:100 leverage. You can change both in the execution-account box, and RESET starts the account over.",
          ar: "يبدأ برصيد 100,000 دولار ورافعة 1:100، ويمكن تغييرهما من مربع حساب التنفيذ. أما زر RESET فيعيد الحساب إلى البداية.",
        },
        {
          en: "It supports market, limit and stop orders, stop loss and take profit, partial closes and margin checks, with profit and loss in USD. The account is saved in paper_account.json.",
          ar: "يدعم أوامر market وlimit وstop، والـ stop loss والـ take profit، والإغلاق الجزئي، وفحص الهامش، مع حساب الربح والخسارة بالدولار. ويُحفظ الحساب في ملف paper_account.json.",
        },
        {
          en: "Stops trigger on wicks. The terminal checks every quote it saw and the source's minute bars, but never a price from before the order existed.",
          ar: "الـ stops تُفعَّل عند لمس ذيل الشمعة: تفحص المنصة كل سعر رأته، وشموع الدقيقة من المصدر، لكن لا تستخدم أبداً سعراً سابقاً لوجود الأمر.",
        },
        {
          en: "Contract sizes are those of the usual CFDs: 100,000 units of a currency pair, 100 oz of gold, 1 unit of an index, 1 coin, 1 share. Any other instrument is 1 unit per lot.",
          ar: "أحجام العقود مثل عقود CFD المعتادة: 100,000 وحدة لزوج العملات، و100 أونصة للذهب، ووحدة واحدة للمؤشر، وعملة رقمية واحدة، وسهم واحد. وأي أداة أخرى تُحسب بوحدة واحدة لكل lot.",
        },
      ],
    },
    {
      heading: { en: "Keys and privacy", ar: "المفاتيح والخصوصية" },
      bullets: [
        {
          en: "Tokens and secrets stay on your computer, in user_config.json or in environment variables, and are sent only to that source's own API.",
          ar: "الـ tokens والـ secrets تبقى على جهازك، في ملف user_config.json أو في متغيرات البيئة، ولا تُرسَل إلا إلى API المصدر نفسه.",
        },
        {
          en: "The Settings panel never receives them back: it shows ••••••, and leaving that untouched keeps the saved value.",
          ar: "لوحة الإعدادات لا تستقبلها أبداً، بل تعرض ••••••، وتركها كما هي يُبقي القيمة المحفوظة.",
        },
        {
          en: "Prefer practice or read-only keys wherever the source offers them.",
          ar: "استخدم مفاتيح practice أو مفاتيح القراءة فقط (read-only) كلما أتاحها المصدر.",
        },
      ],
    },
    {
      heading: { en: "If something goes wrong", ar: "إذا حدثت مشكلة" },
      bullets: [
        {
          en: "TEST says 401 or 403: the token or key is wrong or expired, or a practice token is being used on live (or the other way round).",
          ar: "إذا أظهر TEST الخطأ 401 أو 403، فالـ token أو المفتاح خاطئ أو منتهي الصلاحية، أو أنك تستخدم token من practice على live (أو العكس).",
        },
        {
          en: "429 means too many requests: wait a minute, or raise Quote refresh on Yahoo Finance.",
          ar: "الخطأ 429 يعني طلبات كثيرة جداً: انتظر دقيقة، أو ارفع قيمة Quote refresh في Yahoo Finance.",
        },
        {
          en: "\"Connected, but no quote\": the market is closed, or the ticker has another name on this source (see above).",
          ar: "رسالة \"Connected, but no quote\" تعني أن السوق مغلق، أو أن للرمز اسماً آخر في هذا المصدر (انظر أعلاه).",
        },
        {
          en: "A ticker that keeps failing is skipped for 10 minutes, so one bad name doesn't slow the others down.",
          ar: "الرمز الذي يفشل باستمرار يُتخطّى لمدة 10 دقائق، حتى لا يبطئ اسم خاطئ واحد بقية الرموز.",
        },
        {
          en: "Behind a firewall or proxy, allow the source's address: query1.finance.yahoo.com, api.binance.com, api-fxpractice.oanda.com (api-fxtrade.oanda.com for live), or data.alpaca.markets.",
          ar: "إذا كنت خلف جدار حماية أو proxy، فاسمح بعنوان المصدر: query1.finance.yahoo.com أو api.binance.com أو api-fxpractice.oanda.com (وapi-fxtrade.oanda.com للحساب الحقيقي) أو data.alpaca.markets.",
        },
      ],
    },
  ],
};
