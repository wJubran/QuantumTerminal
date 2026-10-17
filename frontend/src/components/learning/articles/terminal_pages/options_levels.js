// Article: Options Quant → Levels tab

export default {
  id: "page_options_levels",
  category: "terminal_pages",
  order: 11,
  title: {
    en: "Options Quant — Levels",
    ar: "Options Quant — Levels",
  },
  tags: ["options", "gex", "levels", "call wall", "put wall", "flip", "dealer gamma", "0dte", "swing"],
  summary: {
    en: "The GEX ladder. Every strike listed vertically; call GEX drawn right (green), put GEX drawn left (red). Biggest bars are the walls; the flip is where calls ≈ puts. This is the raw positioning map behind the heatmap overlays.",
    ar: "سلّم الـ GEX. كل strike مدرج عمودياً؛ call GEX إلى اليمين (أخضر)، put GEX إلى اليسار (أحمر). الـ bars الأكبر هي الـ walls؛ الـ flip حيث الـ calls ≈ الـ puts. هذه هي خريطة الـ positioning الخام خلف طبقات الـ heatmap.",
  },
  sections: [
    {
      heading: { en: "The ladder at a glance", ar: "السلّم بنظرة واحدة" },
      visual: "options_levels",
      paragraphs: [
        {
          en: "Strikes run from high price at the top to low price at the bottom. For every strike, two bars extend from the central axis: calls growing right, puts growing left. Width is scaled to dealer gamma magnitude at that strike — the wider the bar, the more hedging flow concentrates there.",
          ar: "الـ strikes من الأعلى سعر (أعلى) إلى الأدنى (أسفل). عند كل strike، bar تمتدان من المحور المركزي: الـ calls إلى اليمين، الـ puts إلى اليسار. العرض مقياسه مقدار dealer gamma عند ذلك الـ strike — كلما كان الـ bar أعرض، كلما تركّزت hedging flow أكثر هناك.",
        },
      ],
    },
    {
      heading: { en: "The key landmarks", ar: "المعالم الأساسية" },
      bullets: [
        {
          en: "SPOT (cyan line) — where the ladder is anchored. Price is here now.",
          ar: "SPOT (خط سماوي) — حيث يرتكز السلم. السعر هنا الآن.",
        },
        {
          en: "CALL WALL — the strike with the longest GREEN bar. Typically sits above spot. Acts as resistance because dealers must SELL the underlying as price approaches it (to stay delta-neutral).",
          ar: "CALL WALL — الـ strike الذي يحمل أطول bar أخضر. عادةً فوق الـ spot. يعمل كمقاومة لأن الـ dealers يضطرون لبيع الأصل كلما اقترب السعر منه (للبقاء delta-neutral).",
        },
        {
          en: "PUT WALL — the strike with the longest RED bar. Typically sits below spot. Acts as support — dealers BUY the underlying as price falls toward it.",
          ar: "PUT WALL — الـ strike الذي يحمل أطول bar أحمر. عادةً تحت الـ spot. يعمل كدعم — الـ dealers يشترون الأصل كلما اقترب السعر منه نازلاً.",
        },
        {
          en: "FLIP — the strike where call GEX ≈ put GEX (the bars on either side are roughly equal). Above flip = positive-gamma regime (volatility-dampening); below flip = negative-gamma (moves amplify). This is the most important line for daily direction.",
          ar: "FLIP — الـ strike حيث call GEX ≈ put GEX (الـ bars على الجهتين متساويتان تقريباً). فوق الـ flip = نظام gamma إيجابي (يُخمد الـ volatility)؛ تحته = gamma سلبي (الحركات تتضخم). أهم خط للاتجاه اليومي.",
        },
      ],
    },
    {
      heading: { en: "Swing vs 0-DTE sub-view", ar: "SWING مقابل 0-DTE" },
      paragraphs: [
        {
          en: "The panel has two sub-views. SWING aggregates all expirations (full ladder — use for multi-day setups). 0-DTE (zero-days-to-expiry) shows only today's expiring options — these dominate intraday price action because their gamma is enormous and decays to zero at the close.",
          ar: "الصفحة تحتوي على عرضين فرعيين. SWING يجمع كل تواريخ الانتهاء (السلّم الكامل — استخدمه للـ setups متعددة الأيام). 0-DTE (zero-days-to-expiry) يعرض فقط options المنتهية اليوم — هذه تهيمن على حركة السعر خلال اليوم لأن gamma الخاصة بها ضخمة وتهبط للصفر عند الإغلاق.",
        },
      ],
    },
    {
      heading: { en: "How to use it when trading", ar: "كيف تستخدمه أثناء التداول" },
      bullets: [
        {
          en: "Price grinding up into the CALL WALL in positive-gamma regime → high probability of stalling or reversing there. A good zone to trim longs or fade short-term.",
          ar: "السعر يطحن صاعداً نحو CALL WALL في نظام gamma إيجابي → احتمال عالٍ للتوقف أو الانعكاس هناك. منطقة جيدة لتقليل المراكز الطويلة أو عمل fade قصير الأمد.",
        },
        {
          en: "Price breaks through a wall with volume → dealers are forced to hedge in the direction of the move, which accelerates it. Don't fight a confirmed wall break.",
          ar: "السعر يكسر wall بكميات كبيرة → الـ dealers يُجبرون على الـ hedge في اتجاه الحركة، مما يسرّعها. لا تعارض كسر wall مؤكد.",
        },
        {
          en: "Price at or below FLIP → expect 1.5–2× normal daily range. Size smaller, trail stops wider.",
          ar: "السعر عند أو تحت FLIP → توقع range يومي 1.5 إلى 2 ضعف الطبيعي. قلّل الحجم، وسّع الـ stops.",
        },
        {
          en: "Thin ladder (no big bars anywhere) → no dealer anchors, price can drift freely. Setups should rely on other lenses.",
          ar: "سلّم نحيل (لا bars كبيرة في أي مكان) → لا توجد مراسي للـ dealers، السعر يتحرك بحرية. استند على عدسات أخرى للـ setups.",
        },
      ],
    },
    {
      heading: { en: "Caveats", ar: "تحفظات" },
      bullets: [
        {
          en: "GEX is computed by the terminal from the SPY, QQQ, GLD, SLV and USO option chains (Yahoo, ~15 min delayed), refreshed every 15 minutes while New York trades.",
          ar: "تحسب المنصة الـ GEX من سلاسل خيارات SPY وQQQ وGLD وSLV وUSO (من Yahoo، متأخرة نحو 15 دقيقة)، وتحدّثه كل 15 دقيقة أثناء تداول نيويورك.",
        },
        {
          en: "Heavy news / event risk (FOMC, CPI, earnings) overrides positioning. Walls don't hold during a surprise.",
          ar: "الأخبار الثقيلة (FOMC, CPI, أرباح) تتجاوز الـ positioning. الـ walls لا تصمد أمام مفاجأة.",
        },
        {
          en: "On CFD index charts (US500, USTEC, etc.) the strikes shown are already converted to CFD price space — no extra math needed.",
          ar: "على شارتات CFD index (US500, USTEC, إلخ) الـ strikes المعروضة محوّلة مسبقاً إلى CFD price space — لا حاجة لحسابات إضافية.",
        },
      ],
    },
  ],
};
