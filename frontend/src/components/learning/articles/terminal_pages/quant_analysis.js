// Article: Quant Analysis Page

export default {
  id: "page_quant_analysis",
  category: "terminal_pages",
  order: 1,
  title: {
    en: "Quant Analysis Page",
    ar: "صفحة Quant Analysis",
  },
  tags: ["quant analysis", "chart", "cones", "bands", "gex", "signals", "positions"],
  summary: {
    en: "The main chart surface. Shows live price + every analytical overlay in one view: cones, bands, GEX levels, positions, drawings.",
    ar: "صفحة الشارت الرئيسية. تعرض السعر اللحظي مع كل الطبقات التحليلية في مكان واحد: cones، bands، GEX levels، positions، والرسومات.",
  },
  sections: [
    {
      heading: { en: "What you see", ar: "ما تراه" },
      paragraphs: [
        {
          en: "A candlestick chart powered by LWC v5. The top toolbar lets you toggle every overlay group and switch timeframes. The right sidebar holds your open positions and exposure summary.",
          ar: "شارت شموع يعمل على LWC v5. الـ toolbar العلوي يسمح لك بتفعيل أي طبقة والتبديل بين الـ timeframes. الـ sidebar اليمين يعرض الصفقات المفتوحة وخلاصة المخاطر.",
        },
      ],
    },
    {
      heading: { en: "Top toolbar — button by button", ar: "الـ Toolbar العلوي — زر بزر" },
      bullets: [
        {
          en: "TICKER label (orange) — the active instrument. TRADE button flips the quick BUY/SELL bar next to it.",
          ar: "اسم الـ TICKER (برتقالي) — الأداة المفعلة. زر TRADE يُظهر أو يخفي شريط BUY/SELL السريع بجانبه.",
        },
        {
          en: "Timeframe buttons (M1 → D1) — pick your candle resolution. The bar timer next to them shows seconds left until the current bar closes.",
          ar: "أزرار الـ timeframe (من M1 إلى D1) — اختر دقة الشموع. المؤقت بجانبها يعرض الثواني المتبقية حتى إغلاق الشمعة الحالية.",
        },
        {
          en: "CONES dropdown — enable GBM / MJD / Bates envelopes by horizon (now, weekly, monthly, extremes, quarterly).",
          ar: "قائمة CONES — فعّل envelopes الخاصة بـ GBM / MJD / Bates حسب الأفق الزمني (now, weekly, monthly, extremes, quarterly).",
        },
        {
          en: "BANDS dropdown — probability bands around price. Different from cones: bands are rolling, cones are forward.",
          ar: "قائمة BANDS — probability bands حول السعر. تختلف عن الـ cones: الـ bands تتحرك مع السعر، الـ cones تتحرك للأمام.",
        },
        {
          en: "GEX dropdown — magnets / springs / reinforced / thin-ice levels (see GEX article).",
          ar: "قائمة GEX — مستويات magnets / springs / reinforced / thin-ice (راجع مقال GEX).",
        },
        {
          en: "BATES dropdown — variant of cones using stochastic volatility + jumps. Use when markets are regime-shifting or news-driven.",
          ar: "قائمة BATES — نسخة من الـ cones باستخدام stochastic volatility + jumps. استعملها لما السوق يتغير نظامه أو تهيمن عليه الأخبار.",
        },
        {
          en: "SOLID DEV toggle — switches cone deviation lines between solid and dashed styles.",
          ar: "زر SOLID DEV — يبدّل خطوط الانحراف (sd1/sd2/sd3) بين solid و dashed.",
        },
        {
          en: "INDICATORS dropdown — volume bars, RSI, ATR, EMA bands, VWAP, open positions overlay, trade history.",
          ar: "قائمة INDICATORS — volume bars، RSI، ATR، EMA bands، VWAP، طبقة الصفقات المفتوحة، سجل التداولات.",
        },
        {
          en: "Drawing toolbar — trendlines, rectangles, pen, position sketches. Drawings persist per ticker.",
          ar: "شريط الرسومات — trendlines، رسم مستطيلات، قلم، رسم صفقات. الرسومات محفوظة لكل ticker.",
        },
        {
          en: "ORDER button — opens the full order ticket (manual entry with SL/TP confirm). Green when live trading is on.",
          ar: "زر ORDER — يفتح order ticket كامل (إدخال يدوي مع تأكيد SL/TP). يكون أخضر لما الـ live trading مفعّل.",
        },
        {
          en: "F (Fit) — snaps the visible range to the last 600 candles and re-enables auto-scale.",
          ar: "زر F (Fit) — يضبط النطاق المرئي ليُظهر آخر 600 شمعة ويُعيد تفعيل auto-scale.",
        },
        {
          en: "Camera — exports the current chart as a PNG.",
          ar: "زر الكاميرا — يُصدّر الشارت الحالي كصورة PNG.",
        },
      ],
    },
    {
      heading: { en: "Quick trade bar", ar: "شريط التداول السريع" },
      paragraphs: [
        {
          en: "Activate via the TRADE button. Shows BUY (green) + lot size input + SELL (red). Click BUY or SELL → instant market order at the bid/ask, no confirmation. Default lot = the symbol's minimum. See the separate quick-trade article for PENDING orders and drag-to-modify SL/TP.",
          ar: "فعّل الشريط بزر TRADE. يظهر BUY (أخضر) + حقل حجم الصفقة + SELL (أحمر). الضغط على BUY أو SELL → market order فوري على الـ bid/ask بدون تأكيد. حجم الصفقة الافتراضي = الحد الأدنى للرمز. راجع مقال quick-trade للـ PENDING orders وطريقة سحب SL/TP.",
        },
      ],
    },
    {
      heading: { en: "Sub-tabs: LIVE vs REPLAY", ar: "التبويبات الفرعية: LIVE مقابل REPLAY" },
      paragraphs: [
        {
          en: "LIVE = real-time market. REPLAY = historical playback — scrub through past bars to review setups after the fact. Only one sub-tab active at a time.",
          ar: "LIVE = السوق في الوقت الحقيقي. REPLAY = إعادة تشغيل تاريخية — تنقّل عبر الشموع الماضية لمراجعة الإعدادات لاحقاً. تبويب واحد فقط مفعّل في كل مرة.",
        },
      ],
    },
  ],
};
