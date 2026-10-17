// Article: Mean Reversion setup

export default {
  id: "setup_mean_reversion",
  category: "setups",
  order: 1,
  title: {
    en: "Mean Reversion Setup",
    ar: "إعداد Mean Reversion",
  },
  tags: ["mean reversion", "ou", "setup", "oversold", "overbought", "sigma"],
  summary: {
    en: "Buy when price is stretched far below its statistical mean; exit when it reverts back. Works best in range-bound markets.",
    ar: "الشراء عندما يكون السعر ممتداً بعيداً تحت الـ mean الإحصائي، والخروج عندما يعود إليه. يعمل بشكل أفضل في الأسواق المتذبذبة (ranging).",
  },
  sections: [
    {
      heading: { en: "The idea in one picture", ar: "الفكرة بصورة واحدة" },
      visual: "mean_reversion",
      paragraphs: [
        {
          en: "Price drops into the extreme zone (roughly −2σ below its rolling mean), we buy there, and we target a return to the mean. The diagram shows the full cycle: stretched low → entry → reversion → exit at the mean.",
          ar: "السعر ينزل إلى منطقة extreme (حوالي −2σ تحت الـ mean)، ندخل شراء هناك، والهدف عودته إلى الـ mean. الرسم يعرض الدورة الكاملة: extreme → دخول → reversion → خروج عند الـ mean.",
        },
      ],
    },
    {
      heading: { en: "When it works", ar: "متى يعمل" },
      bullets: [
        {
          en: "The market is ranging, not trending, and the MICRO regime reads calm or normal (REGIMES strip).",
          ar: "السوق في range وليس في trend، وحالة MICRO في شريط REGIMES هي calm أو normal.",
        },
        {
          en: "OU half-life is short (a few days) — the price statistically wants to come back fast.",
          ar: "الـ OU half-life قصير (عدة أيام) — السعر إحصائياً يميل للعودة بسرعة.",
        },
        {
          en: "Hurst exponent < 0.5 — anti-persistent behavior, consistent with mean reversion.",
          ar: "الـ Hurst exponent أقل من 0.5 — سلوك anti-persistent يتماشى مع mean reversion.",
        },
        {
          en: "No major news catalyst pushing the market into a new regime.",
          ar: "لا توجد أخبار كبيرة تدفع السوق لنظام جديد.",
        },
      ],
    },
    {
      heading: { en: "Entry and exit", ar: "الدخول والخروج" },
      paragraphs: [
        {
          en: "Entry: buy when price touches the −2σ band (or the extreme-low from recent history). Exit: sell back at the mean line. Optional second exit at +1σ if the move has momentum past the mean.",
          ar: "الدخول: شراء عند لمس السعر لـ −2σ (أو extreme-low من التاريخ القريب). الخروج: بيع عند الـ mean line. خروج ثاني اختياري عند +1σ إذا استمر momentum بعد الـ mean.",
        },
      ],
    },
    {
      heading: { en: "Where it fails", ar: "متى يفشل" },
      bullets: [
        {
          en: "Trend breakout: if price breaks below the extreme low with volume, the mean itself is shifting. Stop out.",
          ar: "Trend breakout: إذا كسر السعر الـ extreme low بكميات كبيرة، فالـ mean نفسه ينتقل. اخرج بخسارة.",
        },
        {
          en: "Regime change: the MICRO regime turns stressed, or IMMINENT appears, mid-trade → tighten stop or exit early.",
          ar: "تغيّر الحالة: تتحول حالة MICRO إلى stressed أو يظهر تنبيه IMMINENT أثناء الصفقة → شدّ الـ stop أو اخرج مبكراً.",
        },
        {
          en: "Options lens flags tail risk: if the RN distribution shows unusual left-tail pricing, the market is paying up for a crash — don't fade that.",
          ar: "Options lens تحذّر من tail risk: إذا أظهر الـ RN distribution تسعيراً غير عادي لـ left tail، فالسوق يدفع تأمين ضد انهيار — لا تعاند.",
        },
      ],
    },
  ],
};
