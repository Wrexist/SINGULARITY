/**
 * Tiny ambient sparkline (SVG polyline, currentColor) for the Lab Stats sheet —
 * the last few minutes of a rate, so "Compute / sec" reads as a living trace
 * instead of a lone figure. Single series, no axes, no labels, no tooltip: the
 * exact value sits right beside it in the row. Recessive by design (thin 1.5px
 * line + end dot); static markup, so reduced motion needs no special case.
 */
export function Sparkline({ values, width = 56, height = 16 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  // A flat trace (steady rate) draws as a midline rather than collapsing.
  let span = max - min;
  if (span < 1e-9) {
    min -= 0.5;
    span = 1;
  }
  const pad = 2;
  const n = values.length;
  const pts = values
    .map((v, i) => {
      const x = pad + ((width - pad * 2) * i) / (n - 1);
      const y = pad + (height - pad * 2) * (1 - (v - min) / span);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const [lastX, lastY] = pts.split(" ").pop()!.split(",");
  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="1.8" fill="currentColor" />
    </svg>
  );
}
