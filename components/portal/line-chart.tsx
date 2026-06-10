"use client";

interface DataPoint {
  date: string;
  value: number;
}

interface LineChartProps {
  data: DataPoint[];
  color?: string;
  height?: number;
  showDates?: boolean;
}

export function LineChart({
  data,
  color = "#3B82F6",
  height = 200,
  showDates = false,
}: LineChartProps) {
  if (data.length < 2) return null;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values, 1);
  const range = max - min || 1;

  const w = 600;
  const h = height;
  const padX = 8;
  const padY = showDates ? 24 : 12;

  const pts = data.map((d, i) => {
    const x = padX + (i / (data.length - 1)) * (w - padX * 2);
    const y = padY + ((1 - (d.value - min) / range) * (h - padY - 8));
    return { x, y, ...d };
  });

  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  // Fill area
  const areaD =
    pathD +
    ` L ${pts[pts.length - 1].x} ${h - padY} L ${pts[0].x} ${h - padY} Z`;

  // Show date labels every N points to avoid crowding
  const step = Math.max(1, Math.floor(data.length / 6));

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path d={areaD} fill={`url(#grad-${color.replace("#", "")})`} />

      {/* Line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Date labels */}
      {showDates &&
        pts
          .filter((_, i) => i % step === 0 || i === pts.length - 1)
          .map((p, i) => (
            <text key={i} x={p.x} y={h - 6} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.35)">
              {p.date.slice(5)} {/* MM-DD */}
            </text>
          ))}
    </svg>
  );
}
