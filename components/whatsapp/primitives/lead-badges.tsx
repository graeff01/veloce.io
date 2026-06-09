"use client";

import { BADGE_LABEL, BADGE_COLOR, type LeadBadge } from "@/lib/wa-leads";

// Badge Novo / Recorrente / Reativado.
export function StatusBadge({ badge }: { badge: LeadBadge | null | undefined }) {
  if (!badge) return null;
  const color = BADGE_COLOR[badge];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color, background: `color-mix(in srgb, ${color} 12%, transparent)`, padding: "2px 8px", borderRadius: 99, whiteSpace: "nowrap" }}>
      {BADGE_LABEL[badge]}
    </span>
  );
}

// Chip de tag colorida (somente leitura). Para remoção, ver LeadDetails.
export function TagChip({ name, color, onRemove }: { name: string; color: string; onRemove?: () => void }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color, background: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`, padding: "2px 8px", borderRadius: 99 }}>
      {name}
      {onRemove && (
        <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color, display: "flex", padding: 0, marginLeft: 1, opacity: 0.7 }}>×</button>
      )}
    </span>
  );
}
