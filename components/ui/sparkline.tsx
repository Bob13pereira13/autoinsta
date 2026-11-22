import { cx } from "./cx";

/**
 * A small line of real daily numbers. Draws nothing without at least two
 * days of data: no made-up line.
 */
export function Sparkline({
  values,
  width = 96,
  height = 32,
  muted,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  muted?: boolean;
  className?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pad = 2;
  const step = (width - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => `${(pad + i * step).toFixed(1)} ${(height - pad - (v / max) * (height - pad * 2)).toFixed(1)}`);
  return (
    <svg aria-hidden="true" width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" className={cx("text-chart", muted && "opacity-30", className)}>
      <path d={`M${points.join(" L")}`} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
