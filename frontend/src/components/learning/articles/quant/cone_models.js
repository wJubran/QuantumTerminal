// Article: GBM vs MJD vs Bates

export default {
  id: "cone_models",
  category: "quant",
  order: 3,
  title: {
    en: "GBM vs MJD vs Bates — Which Cone When",
    ar: "GBM مقابل MJD مقابل Bates — أي cone ومتى",
  },
  tags: ["gbm", "mjd", "bates", "cone", "model", "jumps", "stochastic volatility", "fat tails"],
  summary: {
    en: "Three cones, three assumptions about how the market really moves. GBM is the textbook baseline; MJD adds jumps; Bates adds stochastic vol on top. Each fits different regimes.",
    ar: "ثلاثة cones وثلاثة افتراضات عن حركة السوق. GBM هو الأساس الكتابي؛ MJD يضيف jumps؛ Bates يضيف stochastic vol فوقه. كل واحد يناسب regime مختلفاً.",
  },
  sections: [
    {
      heading: { en: "Side-by-side", ar: "مقارنة مباشرة" },
      visual: "cone_models",
      paragraphs: [
        {
          en: "Same anchor, same horizon — three models. Left: GBM produces a symmetric narrow cone. Middle: MJD allows occasional jumps (visible as spikes in the paths), widening the tails. Right: Bates adds clustered volatility (vol changes over time), producing the widest and most realistic cone.",
          ar: "نفس الـ anchor، نفس الـ horizon — ثلاثة نماذج. يسار: GBM يُنتج cone متماثل وضيق. وسط: MJD يسمح بقفزات عرضية (تظهر كـ spikes في الـ paths) وتُوسّع الـ tails. يمين: Bates يضيف volatility متكتّل (الـ vol يتغيّر عبر الزمن) ويُنتج cone أوسع وأكثر واقعية.",
        },
      ],
    },
    {
      heading: { en: "GBM — Geometric Brownian Motion", ar: "GBM" },
      paragraphs: [
        {
          en: "The baseline. Assumes returns are normally distributed and volatility is constant. Smooth paths, thin tails, perfectly symmetric.",
          ar: "الأساس. يفترض أن العوائد توزيع طبيعي والـ volatility ثابت. Paths ناعمة، tails رفيعة، تماثل تام.",
        },
      ],
      bullets: [
        { en: "Best when: markets are calm, no news catalysts, trading range-bound.", ar: "أفضل في: أسواق هادئة، لا أخبار، تداول داخل range." },
        { en: "Fails when: real-world fat tails (crashes, squeezes) are priced — GBM underestimates them.", ar: "يفشل عند: fat tails حقيقية (انهيارات، squeezes) — GBM يستهين بها." },
      ],
    },
    {
      heading: { en: "MJD — Merton Jump Diffusion", ar: "MJD" },
      paragraphs: [
        {
          en: "GBM plus a jump process. At random times, price jumps up or down by a random amount. Captures news-driven gaps (earnings, CPI, Fed decisions) that a pure GBM can't see.",
          ar: "GBM زائد jump process. في أوقات عشوائية، السعر يقفز صعوداً أو هبوطاً بمقدار عشوائي. يلتقط news-driven gaps (أرباح، CPI، قرارات فيدرالية) التي لا يراها GBM الصافي.",
        },
      ],
      bullets: [
        { en: "Best when: the asset has a history of gaps or sudden moves around scheduled events.", ar: "أفضل عند: الأصل له تاريخ من الـ gaps أو التحركات المفاجئة حول أحداث مجدولة." },
        { en: "Fails when: you need vol to change over time (it doesn't — only the jump process adds randomness).", ar: "يفشل عند: الحاجة لتغيّر الـ vol مع الوقت (لا يفعل — فقط jump process يضيف عشوائية)." },
      ],
    },
    {
      heading: { en: "Bates — Stochastic Volatility with Jumps (SVJ)", ar: "Bates — Stochastic Vol + Jumps" },
      paragraphs: [
        {
          en: "MJD plus a second stochastic process for volatility itself. Vol drifts, clusters, and mean-reverts. Matches how real markets feel — calm periods, then explosive periods, then calm again.",
          ar: "MJD زائد process ثانٍ عشوائي للـ volatility نفسه. الـ vol ينجرف ويتكتّل ويعود إلى الوسط. يطابق كيف تشعر الأسواق الحقيقية — فترات هدوء، ثم فترات متفجرة، ثم هدوء.",
        },
      ],
      bullets: [
        { en: "Best when: you're trading through a regime shift (e.g., pre- vs post-FOMC) or volatility is obviously changing.", ar: "أفضل عند: التداول خلال regime shift (قبل/بعد FOMC) أو عندما الـ volatility يتغيّر بوضوح." },
        { en: "Fails when: the extra parameters overfit short histories — be careful on illiquid assets.", ar: "يفشل عند: الـ parameters الإضافية تسبّب overfit على تاريخ قصير — احذر مع الأصول illiquid." },
      ],
    },
    {
      heading: { en: "Which to look at", ar: "أيهما تنظر إليه" },
      paragraphs: [
        {
          en: "Compare them. When all three cones agree on a level, confidence is high. When MJD or Bates is materially wider than GBM, the market is pricing in jump or vol risk — respect that signal. If the current tick sits comfortably inside GBM but violates MJD, a jump has probably just happened.",
          ar: "قارن بينهم. عندما الـ cones الثلاثة تتفق على مستوى، الثقة عالية. عندما MJD أو Bates أوسع بشكل ملحوظ من GBM، السوق يسعّر jump أو vol risk — احترم الإشارة. إذا السعر الحالي داخل GBM براحة لكن يخرق MJD، فقفزة حدثت غالباً.",
        },
      ],
    },
  ],
};
