// Article: How the forecast cone is created

export default {
  id: "cone_construction",
  category: "quant",
  order: 2,
  title: {
    en: "How a Forecast Cone Is Built",
    ar: "كيف تُبنى الـ forecast cone",
  },
  tags: ["cone", "monte carlo", "gbm", "percentile", "forecast", "simulation"],
  summary: {
    en: "The cone you see on the chart is the percentile envelope of thousands of simulated price paths. Each line is a quantile of the distribution — not a prediction.",
    ar: "الـ cone الذي تراه على الشارت هو envelope النسب المئوية لآلاف المسارات المحاكاة. كل خط هو quantile للتوزيع — وليس توقعاً واحداً.",
  },
  sections: [
    {
      heading: { en: "From Monte Carlo paths to a cone", ar: "من Monte Carlo paths إلى الـ cone" },
      visual: "cone_construction",
      paragraphs: [
        {
          en: "Every cone starts as a Monte Carlo simulation. From the anchor point (the last known price), we roll a stochastic model forward one small step at a time. At each step the next price is the previous price times a factor drawn from a random distribution (that's the noise of the market).",
          ar: "كل cone يبدأ كـ Monte Carlo simulation. من نقطة الـ anchor (آخر سعر معروف)، نشغّل نموذج stochastic خطوة بخطوة. عند كل خطوة، السعر التالي = السعر السابق × عامل مأخوذ من توزيع عشوائي (هذا هو الـ noise في السوق).",
        },
        {
          en: "We repeat that whole walk thousands of times (typically 20,000 – 100,000 paths). Each path is one possible future; together they cover the full distribution of where price could be at every forward time step.",
          ar: "نكرر هذا المسار كاملاً آلاف المرات (عادةً بين 20,000 و 100,000 path). كل path مستقبل ممكن واحد؛ مجموعها يغطي التوزيع الكامل لمكان السعر في كل لحظة مستقبلية.",
        },
      ],
    },
    {
      heading: { en: "Why lines and not clouds", ar: "لماذا خطوط وليس clouds" },
      paragraphs: [
        {
          en: "At each forward day, we sort all simulated prices and pick specific percentiles: p05, p25, p50, p75, p95 (and sometimes p01 / p99). Those percentiles connected over time become the cone's lines.",
          ar: "عند كل يوم مستقبلي، نرتّب جميع الأسعار المحاكاة ونختار نسباً مئوية محددة: p05, p25, p50, p75, p95 (وأحياناً p01 / p99). هذه النسب موصولة عبر الزمن تصبح خطوط الـ cone.",
        },
        {
          en: "So p50 = the median path — half the simulations ended above, half below. p95 = only 5% of paths reach higher. p05 = only 5% went lower. The lines are statistical boundaries, not forecasts of where price will go.",
          ar: "إذاً p50 = الـ median — نصف الـ simulations انتهى فوقه، نصف تحته. p95 = فقط 5% من الـ paths وصلوا أعلى منه. p05 = فقط 5% نزلوا أدنى منه. الخطوط حدود إحصائية وليست توقعاً لمسار السعر.",
        },
      ],
    },
    {
      heading: { en: "What the widening shape tells you", ar: "ما الذي تقوله شكل الـ cone المتوسع" },
      bullets: [
        {
          en: "The cone fans out because price uncertainty grows with time. One day forward is narrow; thirty days forward is much wider.",
          ar: "الـ cone يتوسّع لأن عدم اليقين في السعر يكبر مع الزمن. يوم للأمام ضيق جداً؛ ثلاثون يوماً أوسع بكثير.",
        },
        {
          en: "The rate of widening depends on the model's volatility parameter. High vol → fan opens quickly. Low vol → stays tight.",
          ar: "معدّل التوسع يعتمد على الـ volatility في النموذج. Vol مرتفع → الـ cone يتوسع بسرعة. Vol منخفض → يبقى ضيقاً.",
        },
        {
          en: "Price staying inside the sd1 envelope (between p25 and p75) is normal behavior. Touching sd2 (p05 / p95) is statistically rare — about 1 day in 20.",
          ar: "بقاء السعر داخل sd1 envelope (بين p25 و p75) سلوك طبيعي. لمس sd2 (p05 / p95) نادر إحصائياً — حوالي يوم واحد من كل 20.",
        },
      ],
    },
    {
      heading: { en: "What the cone is NOT", ar: "ما ليس عليه الـ cone" },
      paragraphs: [
        {
          en: "It's not a prediction. No cone line tells you where price will go — the cone is a probability map of where price might go. The trade comes from watching price move through those percentiles: stretched to −2σ = statistically oversold; touching +2σ on news = extreme move likely to mean-revert; breaking past +2σ without mean-reversion = regime has shifted.",
          ar: "الـ cone ليس توقعاً. لا يوجد خط يخبرك بمكان السعر — الـ cone هو خريطة احتمالية لمكان السعر الممكن. الصفقة تأتي من مراقبة تحرّك السعر عبر هذه النسب: ممتد إلى −2σ = oversold إحصائياً؛ يلمس +2σ بسبب أخبار = حركة extreme غالباً تعود للوسط؛ يكسر +2σ دون return = regime تغيّر.",
        },
      ],
    },
  ],
};
