// Article: Tail Fade setup

export default {
  id: "setup_tail_fade",
  category: "setups",
  order: 3,
  title: {
    en: "Tail Fade Setup",
    ar: "إعداد Tail Fade",
  },
  tags: ["tail fade", "extreme", "mean reversion", "options", "setup", "2 sigma", "liquidation"],
  summary: {
    en: "Sell the extreme spike back to the mean. Different from standard mean reversion — entries happen only at violent +2σ or beyond moves, usually driven by news or liquidation.",
    ar: "بيع القمة الـ extreme للعودة إلى الـ mean. يختلف عن mean reversion العادي — الدخول فقط عند حركات عنيفة تتجاوز +2σ، غالباً بسبب أخبار أو liquidation.",
  },
  sections: [
    {
      heading: { en: "The idea in one picture", ar: "الفكرة بصورة واحدة" },
      visual: "tail_fade",
      paragraphs: [
        {
          en: "Price drifts normally inside the ±1σ envelope. A sudden violent spike pushes into the +2σ tail — usually a news flash or a liquidation cascade. Statistically, that kind of move is rare and often unsustainable. We fade the spike: sell at the tail top and target a return to the mean.",
          ar: "السعر يتحرك بشكل طبيعي داخل نطاق ±1σ. ارتفاع عنيف مفاجئ يدفعه إلى tail +2σ — عادةً بسبب news flash أو liquidation cascade. إحصائياً، هذه الحركات نادرة وغير قابلة للاستمرار غالباً. نبيع القمة (fade) ونستهدف العودة إلى الـ mean.",
        },
      ],
    },
    {
      heading: { en: "When it works", ar: "متى يعمل" },
      bullets: [
        {
          en: "The spike has no real fundamental driver — pure positioning / liquidation.",
          ar: "الـ spike ليس له سبب fundamental حقيقي — فقط positioning / liquidation.",
        },
        {
          en: "The options lens shows tail pricing hasn't widened much — meaning smart money doesn't believe the move either.",
          ar: "Options lens تُظهر أن tail pricing لم يتسع كثيراً — أي الـ smart money لا يصدّق الحركة.",
        },
        {
          en: "Price reaches or exceeds the cone's +2σ / +3σ band on the relevant horizon (a 1-in-20 or rarer event).",
          ar: "السعر يصل أو يتجاوز حزام +2σ / +3σ لأفق الـ cone (حدث بنسبة 1 لكل 20 أو أندر).",
        },
        {
          en: "Dealer gamma flips positive at the spike — dealers will sell into further upside and reinforce the fade.",
          ar: "Dealer gamma يصبح إيجابياً عند الـ spike — الـ dealers سيبيعون عند أي ارتفاع إضافي ويعزّزون الـ fade.",
        },
      ],
    },
    {
      heading: { en: "Entry, target, and stop", ar: "الدخول والهدف والـ stop" },
      paragraphs: [
        {
          en: "Entry: short at the tail's first sign of exhaustion — the first bearish candle after the spike, or a rejection wick at or past +2σ. Target: back at the mean (p50). Stop: just above the tail high — if price grinds higher past that, the spike was real.",
          ar: "الدخول: بيع عند أول إشارة exhaustion في الـ tail — أول شمعة هابطة بعد الـ spike، أو wick مرفوضة عند أو خلف +2σ. الهدف: العودة إلى الـ mean (p50). الـ stop: فوق قمة الـ tail مباشرة — إذا استمر السعر بالصعود فوقها، فالـ spike كان حقيقياً.",
        },
      ],
    },
    {
      heading: { en: "Where it fails", ar: "متى يفشل" },
      bullets: [
        {
          en: "Genuine regime change: rate cut surprise, CPI miss, war headline — the tail becomes the new normal, not a fade.",
          ar: "تغيّر نظامي حقيقي: مفاجأة خفض فائدة، CPI سيء، عنوان حرب — الـ tail يصبح الطبيعي الجديد وليس fade.",
        },
        {
          en: "Options lens shows RN-KL divergence widening: the distribution itself has moved. Don't fade when the market is repricing.",
          ar: "Options lens تُظهر RN-KL divergence يتسع: الـ distribution نفسه انتقل. لا تعمل fade عندما يعيد السوق التسعير.",
        },
        {
          en: "Squeeze in progress: heavy short positioning gets caught, the spike accelerates through multiple standard-deviations. Always respect the stop.",
          ar: "Squeeze جارٍ: positioning قصير ثقيل يتعرض للضغط، الـ spike يتسارع عبر عدة standard deviations. احترم الـ stop دائماً.",
        },
      ],
    },
  ],
};
