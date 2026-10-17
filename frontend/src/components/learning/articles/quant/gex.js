// Article: GEX — Dealer Gamma Exposure

export default {
  id: "gex",
  category: "quant",
  order: 7,
  title: {
    en: "GEX — Dealer Gamma Exposure",
    ar: "GEX — الـ Gamma Exposure للـ Dealers",
  },
  tags: ["gex", "options", "dealer", "gamma", "magnets", "thin ice", "springs"],
  summary: {
    en: "GEX measures how much dealers must hedge as price moves. Positive GEX zones stabilize price (magnets), negative GEX zones amplify moves (thin ice).",
    ar: "GEX يقيس حجم الـ hedging الذي يجب على الـ dealers تنفيذه كلما تحرك السعر. مناطق GEX الموجبة تُثبّت السعر (magnets)، والسالبة تضخّم الحركة (thin ice).",
  },
  sections: [
    {
      heading: { en: "What it is", ar: "ما هو" },
      paragraphs: [
        {
          en: "When retail trades options, the market-maker (dealer) is on the other side. To stay neutral, the dealer hedges in the underlying. How much they hedge — and in which direction — depends on the gamma of their book at each strike. Summed across all open options contracts, that's GEX.",
          ar: "لما الـ retail يشتري options، الـ market-maker (الـ dealer) يكون في الطرف المقابل. لكي يبقى الـ dealer محايداً، يقوم بعمل hedge في الأصل الأساسي. حجم واتجاه الـ hedge يعتمد على gamma للـ book عند كل strike. مجموع هذا عبر جميع العقود المفتوحة = GEX.",
        },
      ],
    },
    {
      heading: { en: "Positive vs negative GEX", ar: "GEX الموجب مقابل السالب" },
      bullets: [
        {
          en: "Positive GEX → dealers sell into rallies and buy into dips → price compresses, ranges tighten. These strikes act like magnets.",
          ar: "GEX موجب → الـ dealers يبيعون عند الصعود ويشترون عند الهبوط → السعر يضيق في نطاق محدد. هذه الـ strikes تعمل كـ magnets تشد السعر.",
        },
        {
          en: "Negative GEX → dealers buy into rallies and sell into dips → price accelerates in whatever direction it starts moving. These strikes are thin ice — once price cracks through, moves get bigger.",
          ar: "GEX سالب → الـ dealers يشترون عند الصعود ويبيعون عند الهبوط → السعر يتسارع في أي اتجاه يبدأ فيه. هذه الـ strikes هي thin ice — لما السعر يخترقها، الحركات تتضخم.",
        },
        {
          en: "Springs are a hybrid — supportive in one direction, unstable in the other.",
          ar: "الـ Springs نوع هجين — داعم في اتجاه، غير مستقر في الاتجاه الآخر.",
        },
      ],
    },
    {
      heading: { en: "How to read it on the chart", ar: "كيف تقرأها على الشارت" },
      paragraphs: [
        {
          en: "Turn on the GEX dropdown and enable magnets / springs / reinforced / thin-ice toggles. Each selected level draws as a horizontal line at its strike. Price approaching a magnet level tends to pause there. Price breaking a thin-ice level often accelerates.",
          ar: "افتح قائمة GEX وفعّل الأزرار (magnets / springs / reinforced / thin-ice). كل level مُفعّل يُرسم كخط أفقي عند strike الخاص به. اقتراب السعر من magnet غالباً يبطّئه. كسر thin-ice غالباً يسرّعه.",
        },
      ],
    },
    {
      heading: { en: "Caveats", ar: "تحفظات" },
      bullets: [
        {
          en: "GEX is computed by the terminal from public option chains (about 15 minutes delayed), refreshed every 15 minutes while New York trades. Use it as structural context, not a tick-by-tick signal.",
          ar: "تحسب المنصة الـ GEX من سلاسل خيارات عامة (متأخرة نحو 15 دقيقة)، وتحدّثه كل 15 دقيقة أثناء تداول نيويورك. استخدمه كسياق هيكلي، لا كإشارة لحظية.",
        },
        {
          en: "Strong news flow overrides GEX structure. Don't expect magnets to hold during a Fed press conference.",
          ar: "الأخبار القوية تلغي هيكل GEX. لا تتوقع أن الـ magnets تصمد خلال مؤتمر الفيدرالي مثلاً.",
        },
      ],
    },
  ],
};
