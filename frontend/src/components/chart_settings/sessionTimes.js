// version: v1
// sessionTimes.js — asset-class → session-time lookup for chart separators.
// All times in IANA "America/New_York" wall-clock; daylight-saving is the
// browser's responsibility via Intl.DateTimeFormat at draw time.

export const SESSION_TIMES = {
  // FX + metals + commodities — daily forex rollover at 17:00 NY (no RTH concept)
  forex_metals_oil: { rthOpen: null,  marketClose: "17:00" },

  // US indices and equities — RTH 09:30–16:00 NY
  us_indices_equities: { rthOpen: "09:30", marketClose: "16:00" },

  // European indices — local market hours expressed in NY time
  eu_indices: { rthOpen: "03:00", marketClose: "11:30" },

  // Crypto — 24/7, no separators
  crypto: { rthOpen: null, marketClose: null },
};

export function classifySymbol(sym) {
  const s = (sym || "").toUpperCase();
  if (/^(BTC|ETH|SOL|XRP|LTC|ADA|DOGE)/.test(s)) return "crypto";
  if (/^(US500|USTEC|US30|SPY|QQQ|DIA|IWM|AAPL|MSFT|NVDA|TSLA|AMZN|META|GOOG|GOOGL|PLTR)/.test(s))
    return "us_indices_equities";
  if (/^(UK100|GER40|FRA40|EUSTX|JP225)/.test(s)) return "eu_indices";
  return "forex_metals_oil";
}

export function sessionTimesFor(symbol) {
  return SESSION_TIMES[classifySymbol(symbol)] || SESSION_TIMES.forex_metals_oil;
}
