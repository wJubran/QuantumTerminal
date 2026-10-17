// Article: Market regimes — the REGIMES strip (backend/local_analysis/regimes.py).
// Rule for Arabic body: keep every technical term in English (HMM, BIC,
// walk-forward, regime, etc.). Surrounding prose is simplified Arabic.

export default {
  id: "regimes",
  category: "quant",
  order: 5,
  title: {
    en: "Market regimes (HMM): calm, stressed, and the macro quadrant",
    ar: "حالات السوق (HMM): الهدوء والضغط وربع الاقتصاد الكلي",
  },
  tags: ["regime", "hmm", "hidden markov model", "volatility", "macro", "goldilocks", "stagflation",
         "reflation", "deflation", "imminent", "حالة السوق", "تقلب"],
  summary: {
    en: "The REGIMES strip above the chart shows two readings: MICRO, the instrument's own volatility regime from calm to stressed, with an alarm when a burst of volatility is likely in the next two hours; and MACRO, the economy's quadrant from growth and inflation. Both are computed by the terminal, and no day is ever labelled with data from after it.",
    ar: "شريط REGIMES فوق الشارت يعرض قراءتين. الأولى MICRO: حالة التقلب الخاصة بالأداة نفسها، من الهدوء (calm) إلى الضغط (stressed)، مع تنبيه عندما يُرجَّح انفجار في التقلب خلال الساعتين القادمتين. والثانية MACRO: موقع الاقتصاد في أحد الأرباع الأربعة حسب النمو والتضخم. تحسب المنصة القراءتين بنفسها، ولا يُصنَّف أي يوم أبداً ببيانات جاءت بعده.",
  },
  sections: [
    {
      heading: { en: "What a regime is", ar: "ما هي الـ regime" },
      paragraphs: [
        {
          en: "Markets alternate between periods that behave differently: quiet weeks with small daily ranges, and stressed weeks where ranges double and gaps appear. A hidden Markov model (HMM) treats these periods as hidden states. It learns from the data what each state looks like and how long it tends to last, then gives, for every day, the probability of each state.",
          ar: "تتناوب الأسواق بين فترات تختلف في سلوكها: أسابيع هادئة بمدى يومي صغير، وأسابيع مضغوطة يتضاعف فيها المدى وتظهر الفجوات. نموذج HMM (hidden Markov model) يعامل هذه الفترات كحالات مخفية: يتعلّم من البيانات شكل كل حالة وكم تدوم عادةً، ثم يعطي لكل يوم احتمال كل حالة.",
        },
      ],
    },
    {
      heading: { en: "MICRO: the instrument's daily regime", ar: "MICRO: حالة الأداة اليومية" },
      bullets: [
        {
          en: "Inputs: each day's return and the realized volatility of the last 5 days, from the active data source's daily bars.",
          ar: "المدخلات: عائد كل يوم، والتقلب المحقق (realized volatility) لآخر 5 أيام، من الشموع اليومية لمصدر البيانات النشط.",
        },
        {
          en: "2 to 4 states, chosen by BIC (the number that explains the data best without overfitting), ordered from calm to stressed by their volatility. The pill shows the regime expected for today and its probability.",
          ar: "من حالتين إلى أربع حالات، يُختار عددها بمعيار BIC (العدد الذي يشرح البيانات أفضل دون مبالغة في التعقيد)، وتُرتَّب من calm إلى stressed حسب تقلبها. وتعرض الشارة الحالة المتوقعة لليوم مع احتمالها.",
        },
        {
          en: "Walk-forward: the model is refitted every month on up to the past four years, and each day is labelled with a model fitted before it. The history you see is what the strip would have shown on each day.",
          ar: "أسلوب walk-forward: يُعاد تدريب النموذج كل شهر على ما يصل إلى السنوات الأربع السابقة، ويُصنَّف كل يوم بنموذج دُرِّب قبله. لذلك فالتاريخ الذي تراه هو نفسه ما كان سيعرضه الشريط في كل يوم.",
        },
        {
          en: "Turn on MICRO to shade the chart by regime. The ▾ menu sets the opacity, hides states, or paints the candles instead.",
          ar: "فعّل MICRO لتلوين خلفية الشارت حسب الحالة. ومن القائمة ▾ يمكنك ضبط الشفافية، وإخفاء بعض الحالات، أو تلوين الشموع نفسها بدلاً من الخلفية.",
        },
      ],
    },
    {
      heading: { en: "IMMINENT: the 15-minute volatility alarm", ar: "IMMINENT: تنبيه التقلب على شموع 15 دقيقة" },
      paragraphs: [
        {
          en: "A second, faster model reads the last 2,000 15-minute bars (about three weeks of a 24-hour market). Each return is first divided by the usual size of moves at that time of day, so the New York open or a busy afternoon is not mistaken for a regime. A two-state model (normal / burst) then forecasts the volatility of the next two hours. ⚠ IMMINENT appears when that forecast is at least 1.5 times the usual for those hours; otherwise the chip reads QUIET with the minutes since the last alarm.",
          ar: "نموذج ثانٍ أسرع يقرأ آخر 2,000 شمعة من شموع 15 دقيقة (نحو ثلاثة أسابيع في سوق يعمل 24 ساعة). يُقسَم كل عائد أولاً على الحجم المعتاد للحركة في ذلك الوقت من اليوم، حتى لا يُحسب افتتاح نيويورك أو فترة بعد الظهر النشطة كحالة جديدة. ثم يتوقّع نموذج بحالتين (عادي / انفجار) تقلب الساعتين القادمتين. تظهر ⚠ IMMINENT عندما يكون هذا التوقع 1.5 ضعف المعتاد لتلك الساعات على الأقل، وإلا تعرض الشارة QUIET مع عدد الدقائق منذ آخر تنبيه.",
        },
      ],
    },
    {
      heading: { en: "MACRO: the growth / inflation quadrant", ar: "MACRO: ربع النمو والتضخم" },
      bullets: [
        {
          en: "GOLDILOCKS: growth up, inflation down. REFLATION: both up. STAGFLATION: growth down, inflation up. DEFLATION: both down.",
          ar: "GOLDILOCKS: نمو صاعد وتضخم هابط. REFLATION: الاثنان صاعدان. STAGFLATION: نمو هابط وتضخم صاعد. DEFLATION: الاثنان هابطان.",
        },
        {
          en: "Growth: the 3-month change of the S&P 500. Inflation: the 3-month change of the 10-year breakeven inflation rate and of WTI crude. Each is measured against its typical size over the last three years, so ±1 is an ordinary move.",
          ar: "النمو: تغيّر مؤشر S&P 500 خلال 3 أشهر. التضخم: تغيّر معدل التضخم المتوقع لـ 10 سنوات (breakeven) ونفط WTI خلال 3 أشهر. ويُقاس كل منها نسبةً إلى حجمه المعتاد في آخر ثلاث سنوات، فالقيمة ±1 تعني حركة عادية.",
        },
        {
          en: "A four-state HMM whose states are pinned to the four corners smooths these readings, so one noisy day doesn't flip the quadrant.",
          ar: "نموذج HMM بأربع حالات مثبتة على الزوايا الأربع ينعّم هذه القراءات، حتى لا يقلب يوم واحد مضطرب الربع بأكمله.",
        },
        {
          en: "The data comes from FRED (Federal Reserve Bank of St. Louis), free and without a key, so MACRO needs internet access to fred.stlouisfed.org. Without it the strip reads \"— no data\".",
          ar: "البيانات من FRED (البنك الاحتياطي الفيدرالي في سانت لويس)، مجاناً وبدون مفتاح، لذلك يحتاج MACRO اتصالاً بالموقع fred.stlouisfed.org. وبدونه يعرض الشريط \"— no data\".",
        },
      ],
    },
    {
      heading: { en: "How to use it", ar: "كيف تستخدمها" },
      bullets: [
        {
          en: "Size and stops: daily ranges in a stressed regime are several times those of a calm one. Widen stops or cut size rather than keeping calm-regime settings.",
          ar: "حجم الصفقة والـ stops: المدى اليومي في الحالة stressed أكبر بعدة مرات منه في الحالة calm، لذلك وسّع الـ stops أو قلّل حجم الصفقة بدلاً من إبقاء إعدادات الفترة الهادئة.",
        },
        {
          en: "Setups: mean-reversion and range trades fit calm and normal regimes; breakouts and tail moves are more common in stressed ones.",
          ar: "أنواع الصفقات: صفقات الارتداد للمتوسط (mean reversion) والـ range تناسب الحالتين calm وnormal، بينما الاختراقات (breakouts) والحركات الطرفية أكثر شيوعاً في الحالة stressed.",
        },
        {
          en: "IMMINENT is a warning, not a direction: volatility is expected to be high, not prices to rise or fall.",
          ar: "تنبيه IMMINENT تحذير وليس اتجاهاً: يعني أن التقلب المتوقع مرتفع، لا أن السعر سيصعد أو يهبط.",
        },
        {
          en: "Regimes describe the recent past and its persistence; they don't predict turning points. A new regime is recognised a few days after it begins.",
          ar: "الـ regimes تصف الماضي القريب ومدى استمراره، ولا تتنبأ بنقاط التحول. والحالة الجديدة لا تُعرف إلا بعد بدايتها ببضعة أيام.",
        },
      ],
    },
  ],
};
