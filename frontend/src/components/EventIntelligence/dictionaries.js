// version: v1
// Static lookup tables shipped with the consumer to enrich each event:
//   1. EVENT_DESCRIPTIONS — short blurb explaining what an event measures
//   2. AFFECTED_PAIRS     — instruments most reactive to the event
//
// Lookup is loose: we lowercase + match common substrings (e.g. "core cpi"
// hits both "Core CPI" and "Core CPI y/y"). Misses fall back gracefully —
// the card just hides those rows rather than showing empty placeholders.

const E = (en) => en;  // placeholder if we ever add EN/AR later

// ── Event descriptions ───────────────────────────────────────────────────
// Keys are lowercase substring patterns. First match wins (more specific
// patterns should appear earlier).

export const EVENT_DESCRIPTIONS = [
  // ── Inflation ──
  ["core cpi",          E("Core inflation excluding volatile food and energy. The Fed's preferred reading for underlying price pressure.")],
  ["core pce",          E("The Fed's preferred core inflation gauge. Quieter than CPI; matters most for rate path.")],
  ["pce",               E("Personal Consumption Expenditures price index. Broader inflation read than CPI.")],
  ["cpi",               E("Consumer Price Index. Headline inflation; large surprises move yields and FX immediately.")],
  ["ppi",               E("Producer Price Index — wholesale prices. Leading indicator for CPI 1–2 months out.")],
  ["inflation",         E("General price-level reading. Higher prints typically push yields up and the currency up.")],

  // ── Employment ──
  ["non-farm payrolls", E("US monthly job creation. The single most-watched US data release of the month.")],
  ["nonfarm payrolls",  E("US monthly job creation. The single most-watched US data release of the month.")],
  ["nfp",               E("Non-Farm Payrolls — US monthly job creation. The single most-watched US release of the month.")],
  ["unemployment rate", E("Share of labor force without work. Lagging indicator; pairs with payrolls for a full picture.")],
  ["jobless claims",    E("Weekly initial claims for unemployment insurance. Leading-edge employment signal.")],
  ["employment change", E("Net change in employed persons over the period. Key labor-market read.")],
  ["adp",               E("ADP private payrolls — released two days before NFP, used as a (noisy) preview.")],
  ["jolts",             E("Job Openings and Labor Turnover Survey. Tightness gauge — high openings = wage pressure.")],

  // ── Central banks ──
  ["fomc",              E("US Federal Reserve rate decision and statement. Dot plot and presser typically move every asset.")],
  ["fed funds",         E("US Federal Reserve target rate. Sets the price of money for the world's reserve currency.")],
  ["ecb rate",          E("European Central Bank policy rate. Drives EUR yield curve and broader EUR pairs.")],
  ["ecb",               E("European Central Bank rate decision / commentary. Watch the press conference for guidance.")],
  ["boe rate",          E("Bank of England policy rate. GBP-pair driver; vote split matters as much as the headline.")],
  ["boe",               E("Bank of England policy decision. GBP-pair driver; vote split matters as much as the headline.")],
  ["boj",               E("Bank of Japan policy. Yield-curve-control and intervention risk make small surprises move yen aggressively.")],
  ["rba",               E("Reserve Bank of Australia rate. Drives AUD pairs; sensitive to China and commodity flows.")],
  ["rbnz",              E("Reserve Bank of New Zealand rate. Less liquid pair, larger relative moves on surprises.")],
  ["boc",               E("Bank of Canada rate. CAD pair driver; oil-price sensitivity amplifies surprises.")],
  ["snb",               E("Swiss National Bank rate. CHF intervention always on the table — watch for currency-floor language.")],

  // ── Activity / sentiment ──
  ["retail sales",      E("Consumer spending pulse. Hot prints reinforce growth narrative; cold prints amplify recession risk.")],
  ["manufacturing pmi", E("Purchasing Managers' Index for manufacturing. Below 50 = contraction. Leads broader activity.")],
  ["services pmi",      E("Services-sector PMI. Below 50 = contraction. Often the bigger half of the economy.")],
  ["composite pmi",     E("Combined manufacturing + services PMI. Single-number read on overall activity.")],
  ["pmi",               E("Purchasing Managers' Index. 50 is the expansion/contraction line. Forward-looking sentiment proxy.")],
  ["ism",               E("ISM survey of US business managers. Manufacturing < 50 = contraction. Often moves SPX and yields.")],
  ["consumer confidence", E("Household sentiment. Trend matters more than single prints — sustained drops precede slowdowns.")],
  ["consumer sentiment", E("University of Michigan sentiment survey. Inflation expectations component is what FOMC watches.")],
  ["industrial production", E("Output from factories, mines and utilities. Hard data, lags surveys by ~2 weeks.")],

  // ── Growth ──
  ["gdp",               E("Gross Domestic Product. Definitive growth read but lagged. Quarterly + revisions.")],

  // ── Trade / FX ──
  ["trade balance",     E("Exports minus imports. Persistent deficits weigh on currency over long horizons.")],
  ["current account",   E("Broader trade + income flow balance. Larger structural-flow read than trade balance alone.")],

  // ── Housing ──
  ["housing starts",    E("New residential construction. Rate-sensitive; first to roll over when policy tightens.")],
  ["building permits",  E("Forward-looking housing read — leads housing starts by 1–2 months.")],
  ["existing home sales", E("Resale transactions. Captures consumer confidence + mortgage affordability.")],
  ["new home sales",    E("Newly-built home sales. Smaller volume but more rate-sensitive than existing sales.")],
  ["case-shiller",      E("Home price index across 20 US metros. Wealth-effect proxy.")],

  // ── Speeches ──
  ["speech",            E("Central bank official speaking. Hawkish/dovish tone shifts can move markets even without policy changes.")],
  ["press conference",  E("Post-decision presser. Often more market-moving than the rate decision itself.")],
  ["minutes",           E("Meeting minutes — the published account of the prior policy decision. Read for vote split and language shifts.")],
  ["testimony",         E("Central bank head testifying before legislators. Q&A often produces unscripted news.")],
];

export function describeEvent(eventName) {
  if (!eventName) return "";
  const key = String(eventName).toLowerCase();
  for (const [pattern, desc] of EVENT_DESCRIPTIONS) {
    if (key.includes(pattern)) return desc;
  }
  return "";
}

// ── Affected instruments per event/currency ──────────────────────────────
// Lookup priority: exact event match → event-pattern match → currency-default
//
// Each entry returns an array of 3-5 ticker codes that historically react
// most to the print. Used for the "Affects:" tag row on each card.

const CURRENCY_DEFAULTS = {
  USD: ["EURUSD", "USDJPY", "DXY", "XAUUSD", "US10Y"],
  EUR: ["EURUSD", "EURJPY", "EURGBP", "STOXX50", "BUND"],
  GBP: ["GBPUSD", "EURGBP", "GBPJPY", "FTSE100"],
  JPY: ["USDJPY", "EURJPY", "GBPJPY", "NIKKEI225"],
  AUD: ["AUDUSD", "AUDJPY", "AUDNZD", "ASX200"],
  CAD: ["USDCAD", "CADJPY", "USOIL"],
  CHF: ["USDCHF", "EURCHF", "CHFJPY"],
  NZD: ["NZDUSD", "AUDNZD", "NZDJPY"],
  CNY: ["USDCNH", "AUDUSD", "XAUUSD"],
};

const EVENT_AFFECTED = [
  // Inflation prints — always pair with broader rates surface
  ["cpi",      { USD: ["EURUSD", "USDJPY", "DXY", "XAUUSD", "US10Y", "US02Y"],
                  EUR: ["EURUSD", "EURJPY", "EURGBP", "BUND"],
                  GBP: ["GBPUSD", "EURGBP", "GILT10Y"] }],
  ["pce",      { USD: ["EURUSD", "USDJPY", "DXY", "XAUUSD", "US10Y"] }],
  ["ppi",      { USD: ["EURUSD", "DXY", "US10Y"] }],

  // Jobs
  ["nfp",      { USD: ["EURUSD", "USDJPY", "DXY", "XAUUSD", "US10Y", "SPX500"] }],
  ["non-farm", { USD: ["EURUSD", "USDJPY", "DXY", "XAUUSD", "US10Y", "SPX500"] }],
  ["nonfarm",  { USD: ["EURUSD", "USDJPY", "DXY", "XAUUSD", "US10Y", "SPX500"] }],
  ["unemployment rate", { USD: ["EURUSD", "USDJPY", "DXY", "US10Y"] }],
  ["jobless claims",    { USD: ["EURUSD", "USDJPY", "DXY"] }],

  // Central bank decisions
  ["fomc",     { USD: ["EURUSD", "USDJPY", "DXY", "XAUUSD", "SPX500", "US10Y", "US02Y"] }],
  ["fed funds",{ USD: ["EURUSD", "USDJPY", "DXY", "US10Y", "US02Y"] }],
  ["ecb rate", { EUR: ["EURUSD", "EURJPY", "EURGBP", "STOXX50", "BUND"] }],
  ["ecb",      { EUR: ["EURUSD", "EURJPY", "EURGBP", "STOXX50", "BUND"] }],
  ["boe",      { GBP: ["GBPUSD", "EURGBP", "GBPJPY", "FTSE100", "GILT10Y"] }],
  ["boj",      { JPY: ["USDJPY", "EURJPY", "GBPJPY", "AUDJPY", "NIKKEI225", "JGB10Y"] }],
  ["rba",      { AUD: ["AUDUSD", "AUDJPY", "AUDNZD", "ASX200"] }],
  ["rbnz",     { NZD: ["NZDUSD", "AUDNZD", "NZDJPY"] }],
  ["boc",      { CAD: ["USDCAD", "CADJPY", "USOIL"] }],
  ["snb",      { CHF: ["USDCHF", "EURCHF", "CHFJPY"] }],

  // Activity / sentiment
  ["retail sales",      { USD: ["EURUSD", "USDJPY", "DXY", "SPX500"],
                          GBP: ["GBPUSD", "FTSE100"],
                          EUR: ["EURUSD", "STOXX50"] }],
  ["pmi",     { USD: ["EURUSD", "DXY", "SPX500"],
                EUR: ["EURUSD", "STOXX50"],
                GBP: ["GBPUSD", "FTSE100"],
                CNY: ["AUDUSD", "USDCNH", "XAUUSD"] }],
  ["ism",     { USD: ["EURUSD", "DXY", "SPX500", "US10Y"] }],
  ["consumer confidence", { USD: ["EURUSD", "DXY", "SPX500"] }],
  ["consumer sentiment",  { USD: ["EURUSD", "DXY", "SPX500"] }],
  ["industrial production",{ USD: ["EURUSD", "DXY", "SPX500"], EUR: ["EURUSD", "STOXX50"] }],

  // Growth
  ["gdp",     { USD: ["EURUSD", "USDJPY", "DXY", "SPX500", "US10Y"],
                EUR: ["EURUSD", "EURJPY", "STOXX50", "BUND"],
                GBP: ["GBPUSD", "FTSE100"] }],

  // Trade
  ["trade balance",  { USD: ["EURUSD", "DXY"], EUR: ["EURUSD"], JPY: ["USDJPY"], CNY: ["AUDUSD", "USDCNH"] }],

  // Housing
  ["housing starts",   { USD: ["EURUSD", "DXY", "SPX500"] }],
  ["building permits", { USD: ["EURUSD", "DXY"] }],
  ["existing home sales", { USD: ["EURUSD", "DXY"] }],
  ["new home sales",   { USD: ["EURUSD", "DXY"] }],

  // Speeches
  ["speech",      null],
  ["testimony",   null],
  ["minutes",     null],
];

export function affectedPairs(eventName, currency) {
  const ccy = (currency || "").toUpperCase();
  const key = String(eventName || "").toLowerCase();
  for (const [pattern, table] of EVENT_AFFECTED) {
    if (key.includes(pattern)) {
      if (table && table[ccy]) return table[ccy];
      // pattern matched but no entry for this currency → fall through to default
      break;
    }
  }
  return CURRENCY_DEFAULTS[ccy] || [];
}

// ── Currency display metadata ────────────────────────────────────────────
// Used by pills, scoreboard, heatmap. Order = canonical sort order in the
// scoreboard / heatmap rows.

export const CURRENCY_META = [
  { code: "USD", name: "US Dollar",     color: "#3796ff" },
  { code: "EUR", name: "Euro",          color: "#5d8eff" },
  { code: "GBP", name: "Pound",         color: "#e8383b" },
  { code: "JPY", name: "Yen",           color: "#ffa500" },
  { code: "AUD", name: "Aus Dollar",    color: "#27c49a" },
  { code: "CAD", name: "Can Dollar",    color: "#ff6d00" },
  { code: "CHF", name: "Swiss Franc",   color: "#9b59b6" },
  { code: "NZD", name: "Kiwi",          color: "#00d2d3" },
  { code: "CNY", name: "Yuan",          color: "#f1c40f" },
];

export function currencyMeta(code) {
  return CURRENCY_META.find(c => c.code === String(code || "").toUpperCase()) || null;
}
