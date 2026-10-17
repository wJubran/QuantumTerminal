// Article: Breakout setup

export default {
  id: "setup_breakout",
  category: "setups",
  order: 2,
  title: {
    en: "Breakout Setup",
    ar: "إعداد Breakout",
  },
  tags: ["breakout", "compression", "range", "volatility", "setup", "thin ice"],
  summary: {
    en: "Buy the decisive close above a tight range. Works best when volatility has been compressed and GEX thin-ice levels break.",
    ar: "الشراء عند إغلاق حاسم فوق range ضيق. يعمل بشكل أفضل بعد فترة compression للـ volatility وعند كسر GEX thin-ice levels.",
  },
  sections: [
    {
      heading: { en: "The idea in one picture", ar: "الفكرة بصورة واحدة" },
      visual: "breakout",
      paragraphs: [
        {
          en: "Price sits inside a horizontal channel between support (S) and resistance (R). Volatility is compressed — candles are tight. A decisive close above R triggers the breakout: entry above the resistance, target = range width projected upward (measured move), stop just below the broken level.",
          ar: "السعر داخل channel أفقي بين support (S) و resistance (R). الـ volatility منخفض والشموع ضيقة. إغلاق حاسم فوق R يطلق الـ breakout: دخول فوق الـ resistance، الهدف = عرض الـ range مسقطاً للأعلى (measured move)، والـ stop تحت المستوى المكسور مباشرة.",
        },
      ],
    },
    {
      heading: { en: "When it works", ar: "متى يعمل" },
      bullets: [
        {
          en: "Bollinger bands narrow — classic compression. GARCH shows volatility rising from a recent floor.",
          ar: "Bollinger bands تضيق — compression كلاسيكي. GARCH يُظهر volatility بدأ يرتفع من قاع حديث.",
        },
        {
          en: "GEX thin-ice level sits right at the range boundary. Breaking thin ice typically accelerates the move because dealers flip from stabilizing to amplifying.",
          ar: "GEX thin-ice level عند حدود الـ range. كسر thin ice يسرّع الحركة عادةً لأن الـ dealers يتحولون من تثبيت السعر إلى تضخيم الحركة.",
        },
        {
          en: "Volume expands on the breakout bar, not just a wick poke — this filters false breakouts.",
          ar: "Volume يتوسع عند شمعة الـ breakout، وليس مجرد wick — هذا يصفّي false breakouts.",
        },
      ],
    },
    {
      heading: { en: "Entry and exit", ar: "الدخول والخروج" },
      paragraphs: [
        {
          en: "Entry: buy the close above resistance, or a retest back to the broken level that holds. Target: projected range width (if R−S = 100 points, target = R + 100). Stop: a few ticks below the broken resistance.",
          ar: "الدخول: شراء عند إغلاق فوق الـ resistance، أو retest يعود لمستوى الـ resistance المكسور ويصمد. الهدف: مسقط عرض الـ range (لو R−S = 100 نقطة، الهدف = R + 100). الـ stop: تحت الـ resistance المكسور بقليل.",
        },
      ],
    },
    {
      heading: { en: "Where it fails", ar: "متى يفشل" },
      bullets: [
        {
          en: "False breakout: price pokes above R, fails to hold, closes back in the range. This is the classic trap — that's why we wait for a confirmed close above R, not just a wick.",
          ar: "False breakout: السعر يخترق R لكن لا يصمد، ويعود ليُغلق داخل الـ range. هذا هو الـ trap الكلاسيكي — لذلك ننتظر إغلاق واضح فوق R، وليس مجرد wick.",
        },
        {
          en: "Massive positive GEX above the break — dealers will sell into the rally and kill the momentum.",
          ar: "GEX إيجابي كبير فوق مستوى الـ breakout — الـ dealers سيبيعون في الرالي ويقتلون الـ momentum.",
        },
        {
          en: "News reversal: a headline during the move that contradicts the direction of the breakout — exit fast.",
          ar: "Reversal بسبب خبر: عنوان معاكس لاتجاه الـ breakout أثناء الصفقة — اخرج بسرعة.",
        },
      ],
    },
  ],
};
