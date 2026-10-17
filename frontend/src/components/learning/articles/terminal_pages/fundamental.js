// Article: Fundamental Page (backend/local_analysis/fundamental.py, cot.py).
// Rule for Arabic body: keep every technical term in English (FRED, CFTC,
// COT, TGA, z-score, etc.). Surrounding prose is simplified Arabic.

export default {
  id: "page_fundamental",
  category: "terminal_pages",
  order: 2,
  title: {
    en: "Fundamental Page",
    ar: "صفحة Fundamental",
  },
  tags: ["fundamental", "macro", "liquidity", "yield curve", "vix", "cot", "cftc", "fred", "scorecard",
         "الاقتصاد الكلي", "السيولة"],
  summary: {
    en: "The macro backdrop in one page: the growth/inflation regime, the Fed's net liquidity, the Treasury curve, the VIX, how speculators are positioned in futures (CFTC COT), and a score for each instrument. The terminal builds it from free public data, refreshed through the day.",
    ar: "الخلفية الاقتصادية في صفحة واحدة: حالة النمو والتضخم، وصافي السيولة لدى الفيدرالي، ومنحنى عوائد السندات الأمريكية، ومؤشر VIX، ومراكز المضاربين في العقود الآجلة (CFTC COT)، ودرجة لكل أداة. تبنيها المنصة من بيانات عامة مجانية، وتتحدّث خلال اليوم.",
  },
  sections: [
    {
      heading: { en: "Where the data comes from", ar: "مصادر البيانات" },
      bullets: [
        {
          en: "FRED (Federal Reserve Bank of St. Louis), free and without a key: the S&P 500, 10-year breakeven inflation and WTI crude for the regime; the Fed's balance sheet (WALCL), the Treasury General Account (WTREGEN) and overnight reverse repo (RRPONTSYD) for liquidity; the 2/5/10/30-year yields, the 10-year real yield, fed funds, the Fed's target range and the VIX.",
          ar: "FRED (البنك الاحتياطي الفيدرالي في سانت لويس)، مجاناً وبدون مفتاح: مؤشر S&P 500 والتضخم المتوقع لـ 10 سنوات ونفط WTI لحساب الـ regime؛ وميزانية الفيدرالي (WALCL) وحساب الخزانة العام (WTREGEN) وعمليات الـ reverse repo الليلية (RRPONTSYD) لحساب السيولة؛ وعوائد سندات 2 و5 و10 و30 سنة، والعائد الحقيقي لـ 10 سنوات، والـ fed funds، والنطاق المستهدف للفائدة، ومؤشر VIX.",
        },
        {
          en: "CFTC Commitments of Traders, weekly (published on Fridays for the Tuesday before), from the CFTC's public API.",
          ar: "تقرير Commitments of Traders من هيئة CFTC، أسبوعياً (يُنشر يوم الجمعة عن يوم الثلاثاء السابق)، من الـ API العام للهيئة.",
        },
        {
          en: "Your active data source's daily bars, for the asset scores.",
          ar: "الشموع اليومية من مصدر البيانات النشط لديك، لحساب درجات الأدوات.",
        },
        {
          en: "It needs internet access to fred.stlouisfed.org and publicreporting.cftc.gov. The last download is kept, so the page still shows the latest data it had while offline; a card whose data was never fetched is left out.",
          ar: "تحتاج اتصالاً بالموقعين fred.stlouisfed.org وpublicreporting.cftc.gov. وتُحفظ آخر نسخة تم تنزيلها، فتبقى الصفحة تعرض آخر بيانات لديها أثناء انقطاع الإنترنت، أما البطاقة التي لم تُنزَّل بياناتها أبداً فلا تظهر.",
        },
      ],
    },
    {
      heading: { en: "The cards", ar: "البطاقات" },
      bullets: [
        {
          en: "Macro regime: the same quadrant as the MACRO strip, with its probability, what it was 30 days ago, and a 12-month trail on the growth/inflation map.",
          ar: "Macro regime: نفس الربع الظاهر في شريط MACRO، مع احتماله، وما كان عليه قبل 30 يوماً، ومسار آخر 12 شهراً على خريطة النمو والتضخم.",
        },
        {
          en: "Net liquidity = Fed balance sheet − Treasury General Account − reverse repo, weekly, with the Fed's rate changes marked. Rising means more cash in the system, which usually supports risk assets.",
          ar: "صافي السيولة = ميزانية الفيدرالي − حساب الخزانة العام − الـ reverse repo، أسبوعياً، مع علامات على قرارات تغيير الفائدة. ارتفاعه يعني نقوداً أكثر في النظام المالي، وهذا يدعم الأصول عالية المخاطرة عادةً.",
        },
        {
          en: "2s10s spread and yield curve: the 10-year minus the 2-year yield, now and three months ago. A negative spread (inverted curve) has often preceded recessions.",
          ar: "فرق 2s10s ومنحنى العوائد: عائد 10 سنوات ناقص عائد سنتين، الآن وقبل ثلاثة أشهر. والفرق السالب (منحنى مقلوب) سبق كثيراً من فترات الركود.",
        },
        {
          en: "VIX: the market's expected 30-day volatility of the S&P 500. Above 25 is fear, below 18 is calm.",
          ar: "VIX: التقلب المتوقع لمؤشر S&P 500 خلال 30 يوماً. فوق 25 يعني خوفاً، وتحت 18 يعني هدوءاً.",
        },
      ],
    },
    {
      heading: { en: "Asset Scorecard", ar: "Asset Scorecard" },
      paragraphs: [
        {
          en: "Each instrument gets a score from −100 to +100, the sum of three parts shown in the table: the regime's rule of thumb for its asset class (40%), the price against its 200-day average (30%) and its 3-month change (30%), the last two in units of its own volatility. Above +20 reads BULLISH, below −20 BEARISH. It summarises the backdrop; it is not a trade signal on its own.",
          ar: "تحصل كل أداة على درجة من −100 إلى +100، وهي مجموع ثلاثة أجزاء يعرضها الجدول: القاعدة العامة للـ regime الحالي بالنسبة لفئة الأداة (40%)، والسعر مقارنةً بمتوسط آخر 200 يوم (30%)، والتغيّر خلال 3 أشهر (30%)، والجزءان الأخيران مقاسان بوحدات تقلب الأداة نفسها. فوق +20 تعني BULLISH، وتحت −20 تعني BEARISH. الدرجة تلخّص الخلفية العامة، وليست إشارة تداول وحدها.",
        },
      ],
    },
    {
      heading: { en: "COT Positioning", ar: "COT Positioning" },
      bullets: [
        {
          en: "The speculators' (non-commercial) net position in the futures behind each instrument, as a z-score against its last three years.",
          ar: "صافي مراكز المضاربين (non-commercial) في العقود الآجلة المقابلة لكل أداة، كقيمة z-score مقارنةً بآخر ثلاث سنوات.",
        },
        {
          en: "Above +1.5 is a crowded long, below −1.5 a crowded short; beyond ±2 a squeeze is possible when the crowd has to unwind. For USD/JPY, USD/CHF and USD/CAD the sign is flipped, because those futures are the foreign currency against the dollar.",
          ar: "فوق +1.5 يعني تكدّساً في الشراء (crowded long)، وتحت −1.5 تكدّساً في البيع (crowded short)، وبعد ±2 قد يحدث squeeze عندما يضطر المتكدّسون للخروج. وفي USD/JPY وUSD/CHF وUSD/CAD تُعكس الإشارة، لأن هذه العقود هي العملة الأجنبية مقابل الدولار.",
        },
        {
          en: "Covered: gold, silver, copper, WTI crude, natural gas, corn, wheat, soybeans, sugar, coffee, cocoa, cotton, the S&P 500, Nasdaq-100 and Dow futures, the major currencies and bitcoin.",
          ar: "الأدوات المغطّاة: الذهب والفضة والنحاس ونفط WTI والغاز الطبيعي والذرة والقمح وفول الصويا والسكر والقهوة والكاكاو والقطن، وعقود S&P 500 وNasdaq-100 وDow، والعملات الرئيسية، والبيتكوين.",
        },
      ],
    },
  ],
};
