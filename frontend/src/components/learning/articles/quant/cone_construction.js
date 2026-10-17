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
          en: "Think of every cone as a Monte Carlo simulation. From the anchor point (the open of the period the cone covers), a stochastic model is rolled forward one small step at a time. At each step the next price is the previous price times a factor drawn from a random distribution (that's the noise of the market).",
          ar: "تخيّل كل cone كـ Monte Carlo simulation. من نقطة الـ anchor (سعر افتتاح الفترة التي يغطيها الـ cone)، يُشغَّل نموذج stochastic خطوة بخطوة. عند كل خطوة، السعر التالي = السعر السابق × عامل مأخوذ من توزيع عشوائي (هذا هو الـ noise في السوق).",
        },
        {
          en: "Repeat that walk thousands of times and each path is one possible future; together they cover the full distribution of where price could be at every forward step. Quantum Terminal computes the GBM and MJD cones exactly (the lines infinitely many paths would give) and simulates 25,000 paths for Bates, using only the price history before the anchor.",
          ar: "كرّر هذا المسار آلاف المرات، فيكون كل path مستقبلاً ممكناً واحداً؛ ومجموعها يغطي التوزيع الكامل لمكان السعر عند كل خطوة مستقبلية. يحسب Quantum Terminal الـ cones الخاصة بـ GBM وMJD بدقة رياضية (الخطوط نفسها التي يعطيها عدد لا نهائي من الـ paths)، ويحاكي 25,000 path لنموذج Bates، مستخدماً فقط تاريخ الأسعار قبل الـ anchor.",
        },
      ],
    },
    {
      heading: { en: "Why lines and not clouds", ar: "لماذا خطوط وليس clouds" },
      paragraphs: [
        {
          en: "At each forward step, all possible prices are sorted and the percentiles that match ±1, ±2 and ±3 standard deviations of a normal distribution are picked: p0.13, p2.3, p15.9, p50, p84.1, p97.7, p99.87. Connected over time they become the cone's lines: sd3 low, sd2 low, sd1 low, median, sd1 high, sd2 high, sd3 high.",
          ar: "عند كل خطوة مستقبلية تُرتَّب كل الأسعار الممكنة، وتُختار النسب المئوية المقابلة لـ ±1 و±2 و±3 انحراف معياري في التوزيع الطبيعي: p0.13 وp2.3 وp15.9 وp50 وp84.1 وp97.7 وp99.87. وعند وصلها عبر الزمن تصبح خطوط الـ cone: sd3 low وsd2 low وsd1 low والـ median وsd1 high وsd2 high وsd3 high.",
        },
        {
          en: "So the median (p50) is the middle — half the paths end above it, half below. Only about 2.3% of paths end above sd2 high, and another 2.3% below sd2 low. The lines are statistical boundaries, not forecasts of where price will go.",
          ar: "إذاً الـ median ‏(p50) هو المنتصف — نصف الـ paths ينتهي فوقه ونصفها تحته. ونحو 2.3% فقط من الـ paths ينتهي فوق sd2 high، و2.3% أخرى تحت sd2 low. الخطوط حدود إحصائية وليست توقعاً لمسار السعر.",
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
          en: "About two thirds of outcomes end inside the sd1 envelope (p15.9 to p84.1) — normal behavior. Only about 1 in 20 ends outside sd2 (p2.3 to p97.7), and about 3 in 1,000 outside sd3.",
          ar: "نحو ثلثي النتائج تنتهي داخل sd1 envelope ‏(من p15.9 إلى p84.1) — سلوك طبيعي. ونحو نتيجة واحدة من كل 20 تنتهي خارج sd2 ‏(من p2.3 إلى p97.7)، ونحو 3 من كل 1,000 خارج sd3.",
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
