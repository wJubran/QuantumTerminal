// version: v1
// TrumpHairIcon — stylized SVG silhouette of the iconic comb-over.
// Used as the icon on the TRUMP button (StatusBar) and on the toast header,
// replacing the previous 🇺🇸 flag emoji per operator request.
// Default fill matches the well-known orange-yellow tone.

export default function TrumpHairIcon({ width = 32, color = "#fdb930", style }) {
  const height = Math.round(width * 0.5);
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 50"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        ...(style || {}),
      }}
      aria-hidden="true"
    >
      {/* Main hair mass with a swept-up peak on the upper-mid suggesting
          the comb-over silhouette. Single closed path so the silhouette
          renders as one solid yellow shape. */}
      <path
        d="
          M 12 42
          C 6 32, 8 18, 18 12
          C 26 8, 32 8, 36 8
          Q 42 0, 56 2
          Q 68 4, 74 8
          C 78 8, 84 12, 88 18
          C 92 26, 92 34, 88 38
          C 84 42, 80 42, 76 40
          C 72 36, 64 35, 56 36
          C 46 38, 36 38, 26 40
          C 20 41, 14 42, 12 42
          Z
        "
        fill={color}
      />
    </svg>
  );
}
