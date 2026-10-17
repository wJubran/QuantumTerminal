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
          en: "Simulated market — started with --sim; see the previous article.",
          ar: "السوق المحاكى — يُشغَّل بالخيار --sim، وتفاصيله في المقال السابق.",
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
      ],
    },
    {
      heading: { en: "Analysis data", ar: "بيانات التحليل" },
      paragraphs: [
        {
          en: "Volatility cones, bands and options levels are read from pre-computed files kept in a local cache. The open-source edition does not ship a data server yet, so these overlays appear only when such files are present. Live charts, orders, the simulator and this Learning Center work without them.",
          ar: "الـ volatility cones والـ bands ومستويات الخيارات تُقرأ من ملفات محسوبة مسبقاً محفوظة في ذاكرة تخزين محلية (cache). النسخة مفتوحة المصدر لا تتضمن سيرفر بيانات حتى الآن، لذلك تظهر هذه الطبقات فقط عند توفر تلك الملفات. أما الشارت الحي والأوامر والمحاكي ومركز التعلم فتعمل بدونها.",
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
