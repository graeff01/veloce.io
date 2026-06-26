"use client";

import { useState } from "react";
import { Loader2, Sparkles, Copy, Check, ClipboardList } from "lucide-react";

interface Prep { abertura: string; resultados: string[]; atendimento: string; falar: string[]; proximos: string[] }

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, borderLeft: "3px solid var(--accent)" };
const cap: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.4 };
const btn = (primary?: boolean): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: primary ? "none" : "1px solid var(--border)", background: primary ? "var(--accent)" : "var(--bg-surface)", color: primary ? "#fff" : "var(--text-secondary)", fontSize: 13, fontWeight: 600, cursor: "pointer" });

export function MeetingPrep({ clientId }: { clientId: string }) {
  const [prep, setPrep] = useState<Prep | null>(null);
  const [period, setPeriod] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  async function gen() {
    setBusy(true); setErr("");
    const d = await fetch(`/api/clients/${clientId}/meeting-prep`).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (d?.prep) { setPrep(d.prep); setPeriod(d.period ?? ""); } else setErr(d?.error ?? "Falha ao gerar o roteiro.");
  }
  function copyAll() {
    if (!prep) return;
    const text = [
      `PREP DE REUNIÃO — ${period}`, "",
      prep.abertura, "",
      "RESULTADOS:", ...prep.resultados.map((x) => `• ${x}`), "",
      ...(prep.atendimento ? [`ATENDIMENTO:`, prep.atendimento, ""] : []),
      "O QUE DIZER:", ...prep.falar.map((x) => `• ${x}`), "",
      "PRÓXIMOS PASSOS:", ...prep.proximos.map((x) => `• ${x}`),
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  const Bullets = ({ items, color }: { items: string[]; color?: string }) => (
    <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, color: "var(--text-primary)", lineHeight: 1.55 }}>
      {items.map((x, i) => <li key={i} style={color ? { listStyle: "none", position: "relative" } : undefined}>{color && <span style={{ position: "absolute", left: -14, color }}>•</span>}{x}</li>)}
    </ul>
  );

  return (
    <section style={{ ...card, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 800, color: "var(--text-primary)" }}><ClipboardList size={15} style={{ color: "var(--accent)" }} /> Prep de reunião (IA)</div>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 3 }}>O roteiro do mês pronto — narrativa, o que dizer e o gargalo enquadrado, ancorado no dado real.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {prep && <button onClick={copyAll} style={btn()}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiado" : "Copiar"}</button>}
          <button onClick={gen} disabled={busy} style={{ ...btn(true), opacity: busy ? 0.6 : 1 }}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {prep ? "Atualizar" : "Gerar prep"}</button>
        </div>
      </div>

      {err && <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 12 }}>{err}</p>}

      {prep && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
          {period && <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{period}</div>}

          <div>
            <div style={cap}>Abertura</div>
            <p style={{ fontSize: 13.5, color: "var(--text-primary)", lineHeight: 1.55, marginTop: 4 }}>{prep.abertura}</p>
          </div>

          {prep.resultados.length > 0 && (
            <div style={{ padding: 12, borderRadius: 10, background: "#16A34A0d", border: "1px solid #16A34A33" }}>
              <div style={{ ...cap, color: "#16A34A" }}>✅ Resultados entregues</div>
              <Bullets items={prep.resultados} />
            </div>
          )}

          {prep.atendimento && (
            <div style={{ padding: 12, borderRadius: 10, background: "#D977060d", border: "1px solid #D9770633" }}>
              <div style={{ ...cap, color: "#D97706" }}>⏱️ Atendimento (o gargalo)</div>
              <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.55, marginTop: 6 }}>{prep.atendimento}</p>
            </div>
          )}

          {prep.falar.length > 0 && (
            <div style={{ padding: 12, borderRadius: 10, background: "var(--accent-soft)", border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)" }}>
              <div style={{ ...cap, color: "var(--accent)" }}>🎤 O que dizer</div>
              <Bullets items={prep.falar} color="var(--accent)" />
            </div>
          )}

          {prep.proximos.length > 0 && (
            <div>
              <div style={cap}>➡️ Próximos passos</div>
              <Bullets items={prep.proximos} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
