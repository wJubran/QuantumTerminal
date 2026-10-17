// Article: Money Flow Page (backend/local_analysis/money_flow.py).
// Rule for Arabic body: keep every technical term in English (ETF, proxy,
// rotation, etc.). Surrounding prose is simplified Arabic.

export default {
  id: "page_money_flow",
  category: "terminal_pages",
  order: 3,
  title: {
    en: "Money Flow Page",
    ar: "صفحة Money Flow",
  },
  tags: ["money flow", "rotation", "sectors", "countries", "etf", "capital flows", "تدفق الأموال", "دوران القطاعات"],
  summary: {
    en: "Where money is rotating, from daily ETF prices and volumes: between asset classes (CAPITAL FLOWS), between US sectors (SECTORS) and between countries (GLOBAL). The terminal builds it every hour from Yahoo Finance.",
    ar: "إلى أين تدور الأموال، من أسعار صناديق ETF وأحجام تداولها اليومية: بين فئات الأصول (CAPITAL FLOWS)، وبين القطاعات الأمريكية (SECTORS)، وبين الدول (GLOBAL). تبنيها المنصة كل ساعة من Yahoo Finance.",
  },
  sections: [
    {
      heading: { en: "CAPITAL FLOWS", ar: "CAPITAL FLOWS" },
      paragraphs: [
        {
          en: "Each circle is an asset class, read through representative ETFs: equities (SPY, QQQ, IWM, EFA, EEM), bonds (TLT, IEF, AGG, LQD, HYG), commodities (GLD, SLV, USO, DBC, DBA, CPER), crypto (IBIT, FBTC, ETHA), T-bills (SHV, BIL, SGOV), the dollar (UUP) and volatility hedges (VXX, UVXY).",
          ar: "كل دائرة فئة أصول، تُقرأ من خلال صناديق ETF تمثّلها: الأسهم (SPY وQQQ وIWM وEFA وEEM)، والسندات (TLT وIEF وAGG وLQD وHYG)، والسلع (GLD وSLV وUSO وDBC وDBA وCPER)، والعملات الرقمية (IBIT وFBTC وETHA)، وأذون الخزانة (SHV وBIL وSGOV)، والدولار (UUP)، وأدوات التحوّط من التقلب (VXX وUVXY).",
        },
        {
          en: "Its \"net flow\" is a proxy, not reported fund flows: each day's return times the dollars traded that day, summed over the period (4 weeks for MACRO, 1 week for MICRO). Strong volume on up days reads as money coming in, on down days as money leaving. The arcs run from the classes under selling pressure to the ones being bought.",
          ar: "والـ \"net flow\" لكل فئة مؤشر تقريبي (proxy) وليس تدفقات صناديق مُعلَنة: عائد كل يوم مضروباً في قيمة التداول بالدولار في ذلك اليوم، مجموعاً على الفترة (4 أسابيع في MACRO، وأسبوع في MICRO). حجم تداول قوي في أيام الصعود يُقرأ كأموال داخلة، وفي أيام الهبوط كأموال خارجة. والأسهم تمتد من الفئات التي تتعرض لضغط بيع إلى الفئات التي يجري شراؤها.",
        },
      ],
    },
    {
      heading: { en: "SECTORS and GLOBAL", ar: "SECTORS وGLOBAL" },
      bullets: [
        {
          en: "SECTORS: the 11 SPDR sector ETFs (XLE, XLF, XLK…), their change over 1 and 4 weeks; the bubble size is the size of the move.",
          ar: "SECTORS: صناديق SPDR للقطاعات الأحد عشر (XLE وXLF وXLK…)، وتغيّرها خلال أسبوع و4 أسابيع، وحجم الفقاعة يعكس حجم الحركة.",
        },
        {
          en: "GLOBAL: country ETFs (SPY, EWJ, FXI, EWG…) on the map, and arcs from the three weakest markets to the three strongest over the period: the rotation their relative performance shows.",
          ar: "GLOBAL: صناديق الدول (SPY وEWJ وFXI وEWG…) على الخريطة، مع أسهم من أضعف ثلاث أسواق إلى أقوى ثلاث خلال الفترة: أي الدوران الذي يُظهره أداؤها النسبي.",
        },
        {
          en: "A ticker that can't be downloaded is left out rather than shown as flat. The page needs internet access to query1.finance.yahoo.com; the world map's shapes come from cdn.jsdelivr.net.",
          ar: "الرمز الذي لا يمكن تنزيله يُستبعد بدلاً من عرضه بلا تغيّر. وتحتاج الصفحة اتصالاً بالموقع query1.finance.yahoo.com، أما أشكال خريطة العالم فتأتي من cdn.jsdelivr.net.",
        },
      ],
    },
  ],
};
