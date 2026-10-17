// Article: Cone horizons (daily / weekly / monthly / quarterly / extremes)

export default {
  id: "cone_horizons",
  category: "quant",
  order: 4,
  title: {
    en: "Cone Horizons — Why We Ship Many",
    ar: "آفاق الـ Cones — لماذا نوفّر عدة آفاق",
  },
  tags: ["cone", "horizon", "daily", "weekly", "monthly", "quarterly", "extremes", "anchor"],
  summary: {
    en: "One asset, multiple cones at different time horizons. Each answers a different question — where can price go today vs this week vs this quarter? Stacking them shows tight short-term expectations inside wide long-term possibilities.",
    ar: "أصل واحد، cones متعددة عند آفاق زمنية مختلفة. كل واحد يجيب سؤالاً مختلفاً — إلى أين يمكن للسعر أن يذهب اليوم، هذا الأسبوع، أو هذا الربع؟ تكديسها يُظهر توقعات قصيرة الأمد ضيقة داخل إمكانيات طويلة الأمد واسعة.",
  },
  sections: [
    {
      heading: { en: "Horizons nest", ar: "الـ Horizons تتداخل" },
      visual: "cone_horizons",
      paragraphs: [
        {
          en: "Each horizon is anchored at the open of its own period — the day, the week, the month, the quarter — and fans out to the end of that period. Short horizons (DAILY, WEEKLY) stay tight; MONTHLY opens up; QUARTERLY opens the widest. Each group also shows the previous periods' cones, so you can see how past forecasts played out.",
          ar: "كل horizon يبدأ من افتتاح فترته — اليوم أو الأسبوع أو الشهر أو الربع — ويتوسع حتى نهاية تلك الفترة. الآفاق القصيرة (DAILY وWEEKLY) تبقى ضيقة؛ وMONTHLY يتسع؛ وQUARTERLY هو الأوسع. وكل مجموعة تعرض أيضاً cones الفترات السابقة، لترى كيف جرت التوقعات الماضية.",
        },
        {
          en: "Quantum Terminal computes the DAILY, WEEKLY, MONTHLY and QUARTERLY cones itself from the feed's daily bars, once per trading day, using only the bars before each anchor. Turn them on from the ▾ next to CONES (and BATES) on a chart.",
          ar: "يحسب Quantum Terminal بنفسه الـ cones الخاصة بـ DAILY وWEEKLY وMONTHLY وQUARTERLY من الشموع اليومية لمصدر البيانات، مرة في كل يوم تداول، مستخدماً فقط الشموع التي سبقت كل anchor. فعّلها من السهم ▾ بجانب CONES (وBATES) على الشارت.",
        },
      ],
    },
    {
      heading: { en: "DAILY cone", ar: "DAILY cone" },
      paragraphs: [
        {
          en: "Anchored at the open of the trading day and ending at its close — today's cone plus the two previous days'. Used for intraday setups — fade extremes inside it, take breakouts of it.",
          ar: "مرسوم من افتتاح يوم التداول وينتهي بإغلاقه — cone اليوم مع cones اليومين السابقين. يُستخدم للـ setups داخل اليوم — اعمل fade للـ extremes داخله، وخذ breakouts منه.",
        },
      ],
    },
    {
      heading: { en: "WEEKLY cone", ar: "WEEKLY cone" },
      paragraphs: [
        {
          en: "Anchored at the start of the trading week (Monday open) and running to the end of the week — 5 trading days for FX and CFDs, 7 for an instrument that trades every day, like the simulator. This week's and last week's cones. The natural horizon for weekly swing trades — align entries with it for better R:R.",
          ar: "مرسوم من بداية الأسبوع التداولي (افتتاح الاثنين) ويمتد حتى نهاية الأسبوع — 5 أيام تداول للعملات والـ CFDs، و7 لأداة تُتداول كل يوم مثل المحاكي. يعرض cone هذا الأسبوع والأسبوع الماضي. الـ horizon الطبيعي لصفقات swing الأسبوعية — توافق الدخول معه يُحسّن الـ R:R.",
        },
      ],
    },
    {
      heading: { en: "MONTHLY cone", ar: "MONTHLY cone" },
      paragraphs: [
        {
          en: "Anchored at the first trading day of the month and running to month end, about 20–23 trading days. This month and the two before. Used for positional trades and to sanity-check whether a weekly move is still within the expected monthly range.",
          ar: "مرسوم من أول يوم تداولي في الشهر ويمتد حتى نهايته، نحو 20–23 يوم تداول. يعرض هذا الشهر والشهرين السابقين. يُستخدم لصفقات positional ولمراجعة ما إذا كانت الحركة الأسبوعية لا تزال ضمن النطاق الشهري المتوقع.",
        },
      ],
    },
    {
      heading: { en: "QUARTERLY cone", ar: "QUARTERLY cone" },
      paragraphs: [
        {
          en: "Anchored at the first trading day of each quarter (Q1 / Q2 / Q3 / Q4) and running to quarter end, about 63–66 trading days. This quarter and the three before, GBM and MJD. Broad context — tells you if the monthly move is normal for the quarter or already stretched.",
          ar: "مرسوم من أول يوم تداولي في كل ربع (Q1/Q2/Q3/Q4) ويمتد حتى نهايته، نحو 63–66 يوم تداول. يعرض هذا الربع والأرباع الثلاثة السابقة، بنموذجي GBM وMJD. يوفّر سياقاً عريضاً — يخبرك ما إذا كانت الحركة الشهرية طبيعية للربع أم ممتدة.",
        },
      ],
    },
    {
      heading: { en: "EXTREMES (ext_high / ext_low)", ar: "EXTREMES" },
      paragraphs: [
        {
          en: "Not a forward cone — rolling envelopes of the historical high and low over a lookback window (default 45 days). Useful as a hard reference: if price is outside ext_high, it's in truly uncharted territory for that window. These need pre-computed data; the built-in engine doesn't produce them yet.",
          ar: "ليس cone مستقبلي — envelopes متحرّكة لأعلى وأدنى سعر تاريخي ضمن نافذة (الافتراضي 45 يوماً). مفيد كمرجع قاسٍ: إذا السعر خارج ext_high، فهو في منطقة غير مسبوقة ضمن هذه النافذة. تحتاج بيانات محسوبة مسبقاً؛ المحرك المدمج لا يحسبها بعد.",
        },
      ],
    },
    {
      heading: { en: "How to combine them", ar: "كيف تجمع بينها" },
      bullets: [
        {
          en: "Strongest setups: price hits an extreme on the DAILY cone AND is still inside the MONTHLY cone → high-quality mean-reversion.",
          ar: "أقوى الـ setups: السعر يصل extreme على DAILY cone ولا يزال داخل MONTHLY cone → mean-reversion عالي الجودة.",
        },
        {
          en: "Breakouts: price breaks out of WEEKLY cone while still inside QUARTERLY → directional move within long-term trend. Continue.",
          ar: "Breakouts: السعر يكسر WEEKLY cone وهو لا يزال داخل QUARTERLY → حركة directional ضمن trend طويل الأمد. استمر.",
        },
        {
          en: "Danger: price is outside QUARTERLY — very stretched on every timescale. Either a genuine new regime or an extreme fade opportunity (check options + fundamentals lenses).",
          ar: "خطر: السعر خارج QUARTERLY — ممتد جداً على كل المقاييس الزمنية. إمّا regime جديد حقيقي أو فرصة fade extreme (راجع عدسة options + fundamentals).",
        },
      ],
    },
  ],
};
