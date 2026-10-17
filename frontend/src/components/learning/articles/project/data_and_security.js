// Article: Data feeds, trading & security.
// Rule for Arabic body: keep every technical term in English (MT5, Rithmic,
// API, DNS rebinding, etc.). Surrounding prose is simplified Arabic.

export default {
  id: "data_and_security",
  category: "project",
  order: 0.4,
  title: {
    en: "Data feeds, trading & security",
    ar: "مصادر البيانات والتداول والأمان",
  },
  tags: ["mt5", "metatrader", "rithmic", "broker", "orders", "security", "data", "أمان", "وسيط"],
  summary: {
    en: "Where prices come from, what happens when you place an order, which panels need pre-computed analysis data, and how the local server is protected.",
    ar: "من أين تأتي الأسعار، وماذا يحدث عند إرسال أمر، وأي اللوحات تحتاج بيانات تحليل محسوبة مسبقاً، وكيف يُحمى السيرفر المحلي.",
  },
  sections: [
    {
      heading: { en: "Data feeds", ar: "مصادر البيانات" },
      bullets: [
        {
          en: "MetaTrader 5 — live prices and order execution through your MT5 terminal (Windows).",
          ar: "MetaTrader 5 — أسعار حية وتنفيذ أوامر عبر منصة MT5 لديك (Windows).",
        },
        {
          en: "Rithmic — futures market data; requires the optional async_rithmic package.",
          ar: "Rithmic — بيانات أسواق العقود الآجلة (futures)، ويتطلب الحزمة الاختيارية async_rithmic.",
        },
        {
          en: "Yahoo Finance, Binance, OANDA, Alpaca and CSV files — picked in ⚙ Settings → DATA SOURCES; see \"Data sources: connect and configure\".",
          ar: "Yahoo Finance وBinance وOANDA وAlpaca وملفات CSV — تُختار من ⚙ Settings ← DATA SOURCES، وتفاصيلها في مقال \"مصادر البيانات: الربط والإعداد\".",
        },
        {
          en: "Simulated market — started with --sim; see \"Simulated market & paper trading\".",
          ar: "السوق المحاكى — يُشغَّل بالخيار --sim، وتفاصيله في مقال \"السوق المحاكى والتداول الورقي\".",
        },
      ],
    },
    {
      heading: { en: "Live trading", ar: "التداول الحقيقي" },
      paragraphs: [
        {
          en: "With MetaTrader 5 connected, orders from the order ticket go to your real MT5 account. They carry the magic number 777, so you can find them in the MT5 history. Try every workflow on a demo account or on the simulator first.",
          ar: "عند ربط MetaTrader 5، تذهب الأوامر من تذكرة الأوامر إلى حساب MT5 الحقيقي لديك. تحمل هذه الأوامر الرقم المميز (magic number) ‏777، لتتمكن من تمييزها في سجل MT5. جرّب كل طريقة عمل على حساب تجريبي أو على المحاكي أولاً.",
        },
        {
          en: "Orders go to the execution account chosen in Settings → DATA SOURCES: MetaTrader 5, OANDA, the simulator, or the paper account on a source's live prices. Nothing is sent while LIVE TRADING is off in Settings → TRADING; the server refuses new orders too.",
          ar: "تذهب الأوامر إلى حساب التنفيذ المختار في Settings ← DATA SOURCES: إما MetaTrader 5 أو OANDA أو المحاكي أو الـ paper account على الأسعار الحية لمصدر البيانات. ولا يُرسَل أي أمر ما دام LIVE TRADING متوقفاً في Settings ← TRADING، فالسيرفر نفسه يرفض الأوامر الجديدة أيضاً.",
        },
      ],
    },
    {
      heading: { en: "Analysis data", ar: "بيانات التحليل" },
      paragraphs: [
        {
          en: "Volatility cones and bands are computed by the terminal itself: a few seconds after start-up, and again whenever a new daily bar appears, it builds the DAILY, WEEKLY, MONTHLY and QUARTERLY cones and the rolling bands (GBM, MJD and Bates) from the feed's own daily bars, plus the files the REPLAY page plays back, and keeps them in a local cache. A cone is one forecast per period; the bands start again at every trading day's open, with their width taken from the last 60 trading days, so they follow the price. Options levels and regimes are read from pre-computed files in the same cache; the open-source edition does not produce those yet, so they appear only when such files are present.",
          ar: "الـ volatility cones والـ bands تحسبها المنصة بنفسها: بعد التشغيل بثوانٍ، ثم كلما ظهرت شمعة يومية جديدة، تبني الـ cones الخاصة بـ DAILY وWEEKLY وMONTHLY وQUARTERLY والـ bands المتحركة (بنماذج GBM وMJD وBates) من الشموع اليومية لمصدر البيانات نفسه، ومعها الملفات التي تعرضها صفحة REPLAY، وتحفظها في ذاكرة تخزين محلية (cache). الـ cone توقّع واحد لكل فترة، أما الـ bands فتبدأ من جديد عند افتتاح كل يوم تداول، ويُحسب اتساعها من آخر 60 يوم تداول، لذلك تتحرك مع السعر. أما مستويات الخيارات والـ regimes فتُقرأ من ملفات محسوبة مسبقاً في الـ cache نفسه؛ والنسخة مفتوحة المصدر لا تنتجها بعد، لذلك تظهر فقط عند توفر تلك الملفات.",
        },
      ],
    },
    {
      heading: { en: "Security", ar: "الأمان" },
      bullets: [
        {
          en: "The server listens on 127.0.0.1 only — other computers cannot reach it.",
          ar: "السيرفر يستمع على 127.0.0.1 فقط — لا يمكن للأجهزة الأخرى الوصول إليه.",
        },
        {
          en: "It rejects requests coming from other websites and DNS-rebinding attempts, so a web page you visit cannot place orders or read data through your running terminal.",
          ar: "يرفض الطلبات القادمة من مواقع أخرى ومحاولات DNS rebinding، لذلك لا تستطيع أي صفحة ويب تزورها إرسال أوامر أو قراءة بيانات عبر منصتك أثناء تشغيلها.",
        },
        {
          en: "Calls to MetaTrader 5 are serialized, so the live chart, the bar checks and your orders never interleave inside the MT5 connection.",
          ar: "استدعاءات MetaTrader 5 تُنفَّذ بالتتابع، فلا تتداخل تحديثات الشارت وفحص الشموع وأوامرك داخل اتصال MT5.",
        },
      ],
    },
  ],
};
