// Article: Cone horizons (now / weekly / monthly / quarterly / extremes)

export default {
  id: "cone_horizons",
  category: "quant",
  order: 4,
  title: {
    en: "Cone Horizons — Why We Ship Many",
    ar: "آفاق الـ Cones — لماذا نوفّر عدة آفاق",
  },
  tags: ["cone", "horizon", "weekly", "monthly", "quarterly", "now", "extremes", "anchor"],
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
          en: "All horizons anchor at the same point (now). Each fans forward to a different distance. Near-term cones (NOW, WEEKLY) stay tight — uncertainty is small over a few days. MONTHLY opens up. QUARTERLY opens the widest.",
          ar: "كل الـ horizons تبدأ من نفس نقطة الـ anchor (الآن). كل واحد يتوسع إلى مسافة مختلفة. الـ cones قصيرة الأمد (NOW, WEEKLY) تبقى ضيقة — عدم اليقين صغير خلال عدة أيام. MONTHLY يتسع. QUARTERLY يتسع أكثر.",
        },
      ],
    },
    {
      heading: { en: "NOW cone", ar: "NOW cone" },
      paragraphs: [
        {
          en: "A few days forward from the current close. Used for intraday and short-swing setups — fade extremes inside it, take breakouts of it.",
          ar: "عدة أيام للأمام من إغلاق اليوم. يُستخدم للـ setups داخل اليوم والـ swing القصير — اعمل fade للـ extremes داخله، وخذ breakouts منه.",
        },
      ],
    },
    {
      heading: { en: "WEEKLY cone", ar: "WEEKLY cone" },
      paragraphs: [
        {
          en: "Anchored at the start of the trading week (Monday open) projecting 5-7 days forward. The natural horizon for weekly swing trades — align entries with it for better R:R.",
          ar: "مرسوم من بداية الأسبوع التداولي (افتتاح الاثنين) ويمتد 5–7 أيام للأمام. الـ horizon الطبيعي لصفقات swing الأسبوعية — توافق الدخول معه يُحسّن الـ R:R.",
        },
      ],
    },
    {
      heading: { en: "MONTHLY cone", ar: "MONTHLY cone" },
      paragraphs: [
        {
          en: "Anchored at the first trading day of the month, running ~20-22 trading days forward. Used for positional trades and to sanity-check whether a weekly move is still within expected monthly range.",
          ar: "مرسوم من أول يوم تداولي في الشهر ويمتد ~20–22 يوم تداولي للأمام. يُستخدم لصفقات positional ولمراجعة ما إذا كانت الحركة الأسبوعية لا تزال ضمن النطاق الشهري المتوقع.",
        },
      ],
    },
    {
      heading: { en: "QUARTERLY cone", ar: "QUARTERLY cone" },
      paragraphs: [
        {
          en: "Anchored quarterly (start of Q1 / Q2 / Q3 / Q4). Spans ~63 trading days. Broad context — tells you if the monthly move is normal for the quarter or already stretched.",
          ar: "مرسوم من بداية كل ربع (Q1/Q2/Q3/Q4) ويمتد ~63 يوم تداولي. يوفّر سياقاً عريضاً — يخبرك ما إذا كانت الحركة الشهرية طبيعية للربع أم ممتدة.",
        },
      ],
    },
    {
      heading: { en: "EXTREMES (ext_high / ext_low)", ar: "EXTREMES" },
      paragraphs: [
        {
          en: "Not a forward cone — rolling envelopes of the historical high and low over a lookback window (default 45 days). Useful as a hard reference: if price is outside ext_high, it's in truly uncharted territory for that window.",
          ar: "ليس cone مستقبلي — envelopes متحرّكة لأعلى وأدنى سعر تاريخي ضمن نافذة (الافتراضي 45 يوماً). مفيد كمرجع قاسٍ: إذا السعر خارج ext_high، فهو في منطقة غير مسبوقة ضمن هذه النافذة.",
        },
      ],
    },
    {
      heading: { en: "How to combine them", ar: "كيف تجمع بينها" },
      bullets: [
        {
          en: "Strongest setups: price hits an extreme on the NOW cone AND is still inside the MONTHLY cone → high-quality mean-reversion.",
          ar: "أقوى الـ setups: السعر يصل extreme على NOW cone ولا يزال داخل MONTHLY cone → mean-reversion عالي الجودة.",
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
