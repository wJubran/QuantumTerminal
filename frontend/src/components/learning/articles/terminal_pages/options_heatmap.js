// Article: Options Quant → Heat Map tab

export default {
  id: "page_options_heatmap",
  category: "terminal_pages",
  order: 10,
  title: {
    en: "Options Quant — Heat Map",
    ar: "Options Quant — Heat Map",
  },
  tags: ["options", "heatmap", "probability field", "max pain", "flip", "walls", "hvl", "expected move"],
  summary: {
    en: "A 2-D probability surface derived from live options pricing. X = forward days, Y = price. Brighter cells = higher options-implied probability. All the classic positioning lines (MAX PAIN, FLIP, walls, HVL, EXP±) are overlaid.",
    ar: "سطح احتمالي ثنائي الأبعاد مشتق من تسعير الـ options الحي. X = الأيام للأمام، Y = السعر. الخلايا الأشد حرارة = احتمال أعلى. كل خطوط الـ positioning الكلاسيكية (MAX PAIN, FLIP, walls, HVL, EXP±) تُعرض فوقه.",
  },
  sections: [
    {
      heading: { en: "What you're looking at", ar: "ما الذي تراه" },
      visual: "options_heatmap",
      paragraphs: [
        {
          en: "Each cell in the grid is the market-implied probability that price will be at that level on that future day. The implied distribution comes from the full options chain, not from a model. Hotter colors (yellow → orange) = more mass, darker = less. The ridge running through the middle is the market's expected path.",
          ar: "كل خلية في الـ grid هي الاحتمال الذي يسعّره السوق بأن السعر سيكون عند ذلك المستوى في ذلك اليوم المستقبلي. التوزيع الضمني يأتي من الـ options chain الكامل، وليس من نموذج. الألوان الأكثر حرارة (أصفر → برتقالي) = كتلة أعلى، والأغمق = أقل. الحافة التي تمتد في المنتصف هي المسار المتوقع للسوق.",
        },
      ],
    },
    {
      heading: { en: "Reading the overlay lines", ar: "قراءة الخطوط المُضافة" },
      bullets: [
        {
          en: "SPOT (cyan) — the current price. Price sits here now. The pill on the left always matches the chart Y-axis.",
          ar: "SPOT (سماوي) — السعر الحالي. السعر هنا الآن. الـ pill على اليسار يطابق دائماً محور Y على الشارت.",
        },
        {
          en: "FLIP (orange) — the zero line for dealer gamma. Below FLIP dealers are short gamma (moves amplify); above FLIP they're long gamma (moves compress). This is the single most important level.",
          ar: "FLIP (برتقالي) — خط الصفر للـ dealer gamma. تحت FLIP يكون الـ dealers قصيري الـ gamma (الحركات تتضخم)؛ فوقها يكونون طويلي الـ gamma (الحركات تهدأ). هذا أهم مستوى.",
        },
        {
          en: "MAX PAIN (purple) — the strike where the maximum number of options expire worthless. Price tends to gravitate here into expiry.",
          ar: "MAX PAIN (بنفسجي) — الـ strike حيث أكبر عدد من الـ options ينتهي بلا قيمة. السعر يميل للانجذاب إليه مع اقتراب expiry.",
        },
        {
          en: "CALL WALL (red) — the strike with the heaviest call positioning above spot. Acts as resistance when gamma is positive — dealers sell into rallies toward it.",
          ar: "CALL WALL (أحمر) — الـ strike الذي يحمل أثقل call positioning فوق الـ spot. يعمل كمقاومة عندما الـ gamma إيجابي — الـ dealers يبيعون في الارتفاعات نحوه.",
        },
        {
          en: "PUT WALL (green) — the strike with the heaviest put positioning below spot. Acts as support for the same gamma reason.",
          ar: "PUT WALL (أخضر) — الـ strike الذي يحمل أثقل put positioning تحت الـ spot. يعمل كدعم للسبب نفسه (gamma).",
        },
        {
          en: "HVL (yellow) — High-Volume Level, the single strike with the most total gamma. A magnet zone.",
          ar: "HVL (أصفر) — High-Volume Level، الـ strike الذي يحمل أعلى gamma إجمالي. منطقة مغناطيس.",
        },
        {
          en: "EXP+ / EXP− (grey dashed) — the options-implied expected move upper and lower bounds (from the ATM straddle). Price inside EXP± is within the market's pricing-in; outside it is anomalous.",
          ar: "EXP+ / EXP− (متقطع رمادي) — الحدود العلوية والسفلية للحركة المتوقعة الضمنية من الـ options (من ATM straddle). السعر داخل EXP± داخل ما يسعّره السوق؛ خارجه شاذ.",
        },
      ],
    },
    {
      heading: { en: "Reading the shape of the surface", ar: "قراءة شكل السطح" },
      bullets: [
        {
          en: "Bright narrow ridge = market has tight conviction on a single path (low implied vol, calm week).",
          ar: "حافة ضيقة ومشرقة = السوق متفق على مسار واحد (implied vol منخفض، أسبوع هادئ).",
        },
        {
          en: "Broad glow = wide uncertainty (earnings, Fed week, geopolitical event).",
          ar: "توهّج واسع = عدم يقين واسع (أرباح، أسبوع فيدرالي، حدث جيوسياسي).",
        },
        {
          en: "Asymmetric density (more heat above vs below spot) = skew. Options are pricing in a directional bias.",
          ar: "كتلة غير متماثلة (حرارة فوق الـ spot أكبر أو أقل) = skew. الـ options تسعّر انحيازاً اتجاهياً.",
        },
        {
          en: "A hot cell far from spot = the market sees that strike as attainable. Often a magnet for price.",
          ar: "خلية حارة بعيدة عن الـ spot = السوق يرى أن هذا الـ strike قابل للوصول. غالباً مغناطيس للسعر.",
        },
      ],
    },
    {
      heading: { en: "BLEND mode", ar: "BLEND mode" },
      paragraphs: [
        {
          en: "Toggle BLEND on and the heatmap fuses the options-implied surface with the GBM cone. At 0% blend you see pure options; at 100% you see pure GBM. Mixing them highlights where the two lenses agree vs diverge — a big mismatch is itself a signal.",
          ar: "فعّل BLEND لدمج السطح الضمني من الـ options مع GBM cone. عند 0% blend ترى options نقي؛ عند 100% ترى GBM نقي. المزج يُظهر أين تتفق العدستان وأين تختلفان — الاختلاف الكبير هو بحد ذاته إشارة.",
        },
      ],
    },
    {
      heading: { en: "Common mistakes", ar: "أخطاء شائعة" },
      bullets: [
        {
          en: "Treating the heatmap as a forecast. It's not — it's a map of where the market has priced probability today. It re-shapes as options trade.",
          ar: "اعتبار الـ heatmap توقعاً. ليس كذلك — إنه خريطة لأين سعّر السوق الاحتمالية اليوم. يُعاد تشكيله مع تداول الـ options.",
        },
        {
          en: "Ignoring FLIP. Whether you're above or below the flip line changes the entire behavior of the market. Direction of FLIP vs spot is the single most useful take-away.",
          ar: "تجاهل FLIP. سواء كنت فوق أو تحت خط الـ flip يُغيّر كامل سلوك السوق. اتجاه FLIP مقابل الـ spot هو أهم ما يمكن أن تأخذه من الصفحة.",
        },
        {
          en: "Reading it intraday for 0-DTE decisions without the 0-DTE sub-tab active. Regular layers are swing-relevant — 0-DTE has its own layer.",
          ar: "قراءته خلال اليوم لقرارات 0-DTE دون تفعيل الـ sub-tab المناسب. الطبقات العادية تخص الـ swing — 0-DTE له طبقة منفصلة.",
        },
      ],
    },
  ],
};
