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

// Curva suave via Catmull-Rom → Bézier cúbica
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function LineChart({
  data,
  color = "#4F46E5",
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
  const padX = 4;
  const padTop = 10;
  const padBottom = 6;

  const pts = data.map((d, i) => ({
    x: padX + (i / (data.length - 1)) * (w - padX * 2),
    y: padTop + (1 - (d.value - min) / range) * (h - padTop - padBottom),
  }));

  const lineD = smoothPath(pts);
  const areaD = `${lineD} L ${pts[pts.length - 1].x} ${h - padBottom} L ${pts[0].x} ${h - padBottom} Z`;

  const gradId = `grad-${color.replace("#", "")}`;

  // Datas renderizadas em HTML (fora do SVG esticado) para não distorcer o texto
  const labelStep = Math.max(1, Math.floor(data.length / 6));
  const labels = data
    .map((d, i) => ({ ...d, i }))
    .filter((d) => d.i % labelStep === 0 || d.i === data.length - 1);

  return (
    <div>
      <svg
        width="100%"
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.16" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gridlines horizontais sutis (tema claro) */}
        {[0.25, 0.5, 0.75].map((f) => {
          const y = padTop + f * (h - padTop - padBottom);
          return (
            <line
              key={f}
              x1={padX} x2={w - padX} y1={y} y2={y}
              stroke="rgba(17,24,39,0.06)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        <path d={areaD} fill={`url(#${gradId})`} />
        <path
          d={lineD}
          fill="none"
          stroke={color}
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {showDates && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 10,
            padding: "0 2px",
          }}
        >
          {labels.map((l) => (
            <span key={l.i} style={{ fontSize: 11, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
              {fmtDate(l.date)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
