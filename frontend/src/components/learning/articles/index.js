// Learning Center article manifest. Add new articles by importing and
// pushing into the ARTICLES array — everything else (nav, search, routing)
// picks them up automatically.

import aboutQuantumTerminal from "./project/about";
import gettingStarted       from "./project/getting_started";
import simulatedMarket      from "./project/simulated_market";
import dataSources          from "./project/data_sources";
import dataAndSecurity      from "./project/data_and_security";
import gbm from "./quant/gbm";
import gex from "./quant/gex";
import coneConstruction from "./quant/cone_construction";
import coneModels       from "./quant/cone_models";
import coneHorizons     from "./quant/cone_horizons";
import quantAnalysisPage from "./terminal_pages/quant_analysis";
import optionsHeatmapPage from "./terminal_pages/options_heatmap";
import optionsLevelsPage  from "./terminal_pages/options_levels";
import meanReversion from "./setups/mean_reversion";
import breakout      from "./setups/breakout";
import tailFade      from "./setups/tail_fade";
import shortcutsReference from "./shortcuts/shortcuts";  // Keyboard & Mouse Shortcuts (last)

export const ARTICLES = [
  aboutQuantumTerminal,
  gettingStarted,
  simulatedMarket,
  dataSources,
  dataAndSecurity,
  gbm,
  coneConstruction,
  coneModels,
  coneHorizons,
  gex,
  quantAnalysisPage,
  optionsHeatmapPage,
  optionsLevelsPage,
  meanReversion,
  breakout,
  tailFade,
  shortcutsReference,
];

// Build a flat search-text index once on module load. Each entry is
// { id, lowerTitle, lowerTags, lowerBody } — enough for substring + tag
// matches without a search library. `lowerBody` concatenates both en and
// ar prose so typing "gex" OR "ثلج" (thin-ice in Arabic, if ever added)
// both hit.
function flatten(article) {
  const parts = [];
  const pushBi = (obj) => { if (obj?.en) parts.push(obj.en); if (obj?.ar) parts.push(obj.ar); };
  pushBi(article.title);
  pushBi(article.summary);
  for (const s of article.sections || []) {
    pushBi(s.heading);
    for (const p of s.paragraphs || []) pushBi(p);
    for (const b of s.bullets    || []) pushBi(b);
  }
  return parts.join(" ").toLowerCase();
}

export const SEARCH_INDEX = ARTICLES.map(a => ({
  id: a.id,
  title_en: (a.title?.en || "").toLowerCase(),
  title_ar: (a.title?.ar || "").toLowerCase(),
  tags: (a.tags || []).map(t => String(t).toLowerCase()),
  body: flatten(a),
}));
