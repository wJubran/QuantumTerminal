// Registry of Learning Center visual components. Article sections can set
// `visual: "key"` and the renderer looks up the component here. Adding a
// new diagram = drop a new file + export it here; everything else is
// automatic.

import MeanReversionDiagram    from "./MeanReversionDiagram";
import BreakoutDiagram          from "./BreakoutDiagram";
import TailFadeDiagram          from "./TailFadeDiagram";
import ConeConstructionDiagram  from "./ConeConstructionDiagram";
import ConeModelsDiagram        from "./ConeModelsDiagram";
import ConeHorizonsDiagram      from "./ConeHorizonsDiagram";
import OptionsHeatmapDiagram    from "./OptionsHeatmapDiagram";
import OptionsLevelsDiagram     from "./OptionsLevelsDiagram";

export const VISUALS = {
  mean_reversion:     MeanReversionDiagram,
  breakout:           BreakoutDiagram,
  tail_fade:          TailFadeDiagram,
  cone_construction:  ConeConstructionDiagram,
  cone_models:        ConeModelsDiagram,
  cone_horizons:      ConeHorizonsDiagram,
  options_heatmap:    OptionsHeatmapDiagram,
  options_levels:     OptionsLevelsDiagram,
};

export default VISUALS;
