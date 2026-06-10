"use client";

interface Bar {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: Bar[];
  height?: number;
}

export function BarChart({ data, height = 180 }: BarChartProps) {
  if (!data.length) return null;

  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 600;
  const h = height;
  const padX = 8;
  const padY = 24;
  const gap = 6;
  const barW = (w - padX * 2 - gap * (data.length - 1)) / data.length;

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
      {data.map((bar, i) => {
        const barH = Math.max(2, ((bar.value / max) * (h - padY - 4)));
        const x = padX + i * (barW + gap);
        const y = h - padY - barH;
        return (
          <g key={i}>
            <rect
              x={x} y={y} width={barW} height={barH}
              fill={bar.color ?? "#3B82F6"}
              rx="3" opacity="0.85"
            />
            <text
              x={x + barW / 2} y={h - 6}
              textAnchor="middle" fontSize="11"
              fill="rgba(255,255,255,0.45)"
            >
              {bar.label}
            </text>
            {bar.value > 0 && (
              <text
                x={x + barW / 2} y={y - 4}
                textAnchor="middle" fontSize="11"
                fill="rgba(255,255,255,0.7)"
              >
                {bar.value}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
