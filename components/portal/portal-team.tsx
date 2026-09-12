"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock, Users, X, ChevronRight, Inbox } from "lucide-react";

// ── Equipe: o que o gestor DECIDE ────────────────────────────────────────────
// Esta tela mostrava convertidos, receita e qualificados — as mesmas perguntas
// do Funil, ditas de outro jeito. Número repetido em duas telas não informa
// duas vezes: faz duvidar de qual das duas está certa. Conversão e receita
// ficaram no Funil, que é onde essa pergunta mora.
//
// Aqui ficou tempo e fila, e o que sai disso: quem está travado, há quanto
// tempo, e o que fazer. A tela abre pelo que precisa de ação — não por uma
// tabela que a pessoa precisa interpretar sozinha.

interface Pessoa {
  email: string; nome: string; equipe: string | null;
  leads: number; esperando: number; esperaMaxMin: number; semResposta: number;
  primeiraRespostaSec: number | null; respostaSec: number | null;
}
interface Grupo extends Omit<Pessoa, "email" | "nome" | "equipe"> { equipe: string }
interface Gargalo {
  tipo: string; gravidade: "alta" | "media";
  titulo: string; detalhe: string; pessoa?: string;
}
interface Geral {
  leads: number; esperando: number; semResposta: number;
  primeiraRespostaSec: number | null; respostaSec: number | null;
}
interface Dados {
  periodLabel: string; geral: Geral | null;
  pessoas: Pessoa[]; equipes: Grupo[] | null; gargalos: Gargalo[];
}

const PERIODS = [{ v: "week", label: "Semana" }, { v: "month", label: "Mês" }];

/** Tempo em palavra curta. "—" quando não há o que dizer, nunca "0". */
function dur(s: number | null): string {
  if (s == null) return "—";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}min`;
  const h = s / 3600;
  return h < 24 ? `${h.toFixed(h < 10 ? 1 : 0)}h` : `${Math.round(h / 24)}d`;
}
function espera(min: number): string {
  if (min <= 0) return "—";
  if (min < 60) return `${min}min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}
function avatarColor(nome: string) {
  let h = 0; for (const c of nome) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 42% 52%)`;
}

export function PortalTeam({ token }: { token: string }) {
  const [d, setD] = useState<Dados | null>(null);
  const [period, setPeriod] = useState("month");
  const [loading, setLoading] = useState(true);
  const [aberta, setAberta] = useState<Pessoa | null>(null);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    fetch(`/api/portal/${token}/equipe-insights?p=${period}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => { if (vivo) { setD(x); setLoading(false); } })
      .catch(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [token, period]);

  const seg: React.CSSProperties = { border: "none", background: "none", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: "var(--p-muted)", padding: "5px 12px", borderRadius: 7, cursor: "pointer" };
  const segOn: React.CSSProperties = { ...seg, background: "var(--p-accent)", color: "var(--p-on-accent)" };

  const pessoas = d?.pessoas ?? [];
  const geral = d?.geral ?? null;

  return (
    <div>
      <div style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 14, padding: "14px 26px", borderBottom: "1px solid var(--p-border)", background: "color-mix(in srgb, var(--p-bg) 82%, transparent)", backdropFilter: "saturate(180%) blur(12px)" }}>
        <div>
          <h1 className="pm-titulo-conteudo" style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: "var(--p-text)" }}>Equipe</h1>
          <div style={{ color: "var(--p-muted)", fontSize: 12.5 }}>Tempo de atendimento e fila · {d?.periodLabel ?? "—"}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 9, padding: 3 }}>
          {PERIODS.map((p) => <button key={p.v} onClick={() => setPeriod(p.v)} style={period === p.v ? segOn : seg}>{p.label}</button>)}
        </div>
      </div>

      <div className="p-wrap">
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--p-muted)", padding: 8 }}>Carregando…</p>
        ) : pessoas.length === 0 ? (
          <div className="p-panel" style={{ padding: 28, textAlign: "center", color: "var(--p-muted)", fontSize: 13.5 }}>
            Ainda não há atendimento para medir. Assim que as conversas começarem a chegar, o tempo de resposta e a fila aparecem aqui.
          </div>
        ) : (
          <>
            {/* ── O que precisa de ação ─────────────────────────────────────
                Primeiro na tela de propósito: é a única parte que pede uma
                decisão hoje. Quando não há nada, a ausência também é notícia. */}
            {d!.gargalos.length > 0 ? (
              <div className="p-panel">
                <div className="p-phead"><h2>Precisa de ação</h2><span className="hint">{d!.periodLabel}</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {d!.gargalos.map((g, i) => {
                    const grave = g.gravidade === "alta";
                    const cor = grave ? "var(--p-crit, #dc2626)" : "#d98324";
                    const pessoa = pessoas.find((p) => p.email === g.pessoa);
                    return (
                      <button key={i} onClick={() => pessoa && setAberta(pessoa)} disabled={!pessoa}
                        style={{ display: "flex", alignItems: "flex-start", gap: 10, width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 12, border: `1px solid color-mix(in srgb, ${cor} 28%, transparent)`, background: `color-mix(in srgb, ${cor} 7%, transparent)`, cursor: pessoa ? "pointer" : "default", font: "inherit" }}>
                        <AlertTriangle size={16} style={{ color: cor, flexShrink: 0, marginTop: 1 }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--p-text)" }}>{g.titulo}</span>
                          <span style={{ display: "block", fontSize: 12.5, color: "var(--p-muted)", lineHeight: 1.5, marginTop: 2 }}>{g.detalhe}</span>
                        </span>
                        {pessoa && <ChevronRight size={16} style={{ color: "var(--p-muted)", flexShrink: 0, marginTop: 2 }} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-panel" style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px" }}>
                <Inbox size={17} style={{ color: "var(--p-good, #1FA855)", flexShrink: 0 }} />
                <span style={{ fontSize: 13.5, color: "var(--p-text)" }}>
                  Nada travado agora — nenhum lead sem resposta e ninguém fora da curva.
                </span>
              </div>
            )}

            {/* ── Tempos do time ─────────────────────────────────────────── */}
            {geral && (
              <div className="p-panel">
                <div className="p-phead"><h2>Tempos</h2><span className="hint">mediana, não média</span></div>
                <div className="p-metrics" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                  <Cell k="1ª resposta" v={dur(geral.primeiraRespostaSec)} icon={<Clock size={13} />} />
                  <Cell k="Resposta no meio da conversa" v={dur(geral.respostaSec)} />
                  <Cell k="Aguardando agora" v={String(geral.esperando)} alerta={geral.esperando > 0} />
                  <Cell k="Sem resposta nenhuma" v={String(geral.semResposta)} critico={geral.semResposta > 0} />
                </div>
                <p style={{ fontSize: 11.5, color: "var(--p-muted)", lineHeight: 1.5, margin: "10px 2px 0" }}>
                  A <b>1ª resposta</b> é o tempo até alguém atender o lead que acabou de chegar.
                  A <b>resposta no meio da conversa</b> é quanto ele espera depois disso, a cada vez que escreve.
                </p>
              </div>
            )}

            {/* ── Por equipe ─────────────────────────────────────────────── */}
            {d!.equipes && d!.equipes.length > 0 && (
              <div className="p-panel">
                <div className="p-phead"><h2>Por equipe</h2></div>
                <div className="p-scroll">
                  <table className="p-table" style={{ minWidth: 520 }}>
                    <thead><tr><th>Equipe</th><th>1ª resposta</th><th>Resposta</th><th>Fila</th><th>Sem resposta</th></tr></thead>
                    <tbody>
                      {d!.equipes.map((e) => (
                        <tr key={e.equipe}>
                          <td><b style={{ textTransform: "capitalize" }}>{e.equipe}</b></td>
                          <td className="tnum">{dur(e.primeiraRespostaSec)}</td>
                          <td className="tnum">{dur(e.respostaSec)}</td>
                          <td className="tnum">{e.esperando}</td>
                          <td className="tnum" style={{ color: e.semResposta > 0 ? "var(--p-crit, #dc2626)" : undefined, fontWeight: e.semResposta > 0 ? 700 : 400 }}>{e.semResposta}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Pessoas: abre o detalhe, como nas outras abas ──────────── */}
            <div className="p-panel">
              <div className="p-phead"><h2>Pessoas</h2><span className="hint">toque para ver o detalhe</span></div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {pessoas.map((p) => (
                  <button key={p.email} onClick={() => setAberta(p)}
                    style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: "11px 6px", border: "none", borderBottom: "1px solid var(--p-border)", background: "transparent", cursor: "pointer", font: "inherit" }}>
                    <span style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, background: avatarColor(p.nome), color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>{p.nome[0]?.toUpperCase()}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--p-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</span>
                      {p.equipe && <span style={{ display: "block", fontSize: 11.5, color: "var(--p-muted)", textTransform: "capitalize" }}>{p.equipe}</span>}
                    </span>
                    <span style={{ display: "flex", gap: 14, flexShrink: 0, textAlign: "right" }}>
                      <Mini k="1ª resp" v={dur(p.primeiraRespostaSec)} />
                      <Mini k="fila" v={String(p.esperando)} alerta={p.esperando > 0} />
                      {p.semResposta > 0 && <Mini k="s/ resposta" v={String(p.semResposta)} critico />}
                    </span>
                    <ChevronRight size={15} style={{ color: "var(--p-muted)", flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {aberta && <Detalhe p={aberta} geral={geral} onFechar={() => setAberta(null)} />}
    </div>
  );
}

// ── Detalhe de uma pessoa ────────────────────────────────────────────────────
// Mesmo padrão das outras abas: a lista fica limpa e o detalhe abre por cima.
function Detalhe({ p, geral, onFechar }: { p: Pessoa; geral: Geral | null; onFechar: () => void }) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFechar]);

  // Comparar com o time é o que transforma um número em informação: 16min é
  // bom ou ruim? Depende do que os outros fazem.
  const compara = (meu: number | null, time: number | null) => {
    if (meu == null || time == null || time === 0) return null;
    const dif = Math.round(((meu - time) / time) * 100);
    if (Math.abs(dif) < 10) return { texto: "na média do time", cor: "var(--p-muted)" };
    return dif > 0
      ? { texto: `${dif}% mais devagar que o time`, cor: "#d98324" }
      : { texto: `${-dif}% mais rápido que o time`, cor: "var(--p-good, #1FA855)" };
  };
  const c1 = compara(p.primeiraRespostaSec, geral?.primeiraRespostaSec ?? null);
  const c2 = compara(p.respostaSec, geral?.respostaSec ?? null);

  return (
    <>
      <div onClick={onFechar} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.38)" }} />
      <div role="dialog" aria-label={`Detalhe de ${p.nome}`}
        style={{ position: "fixed", zIndex: 201, left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "min(430px, calc(100vw - 32px))", maxHeight: "min(76vh, 620px)", overflowY: "auto", background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--p-border)" }}>
          <span style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: avatarColor(p.nome), color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>{p.nome[0]?.toUpperCase()}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ display: "block", fontSize: 15, color: "var(--p-text)" }}>{p.nome}</strong>
            {p.equipe && <span style={{ fontSize: 11.5, color: "var(--p-muted)", textTransform: "capitalize" }}>{p.equipe}</span>}
          </span>
          <button onClick={onFechar} aria-label="Fechar" style={{ border: "none", background: "transparent", color: "var(--p-muted)", cursor: "pointer", display: "inline-flex", padding: 4 }}><X size={16} /></button>
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <Bloco titulo="1ª resposta" valor={dur(p.primeiraRespostaSec)} nota={c1} />
          <Bloco titulo="Resposta no meio da conversa" valor={dur(p.respostaSec)} nota={c2} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Caixa k="Leads no período" v={String(p.leads)} />
            <Caixa k="Aguardando agora" v={String(p.esperando)} alerta={p.esperando > 0} />
            <Caixa k="Espera mais longa" v={espera(p.esperaMaxMin)} alerta={p.esperaMaxMin >= 24 * 60} />
            <Caixa k="Sem resposta nenhuma" v={String(p.semResposta)} critico={p.semResposta > 0} />
          </div>

          {p.semResposta > 0 && (
            <p style={{ fontSize: 12.5, color: "var(--p-muted)", lineHeight: 1.55, margin: 0, padding: "10px 12px", borderRadius: 10, background: "color-mix(in srgb, var(--p-crit, #dc2626) 7%, transparent)" }}>
              {p.semResposta === 1 ? "Um lead escreveu e" : `${p.semResposta} leads escreveram e`} nunca {p.semResposta === 1 ? "recebeu" : "receberam"} nenhuma resposta.
              Isso não é demora — é ausência, e é o primeiro lugar para agir.
            </p>
          )}
          {p.semResposta === 0 && p.esperaMaxMin >= 24 * 60 && (
            <p style={{ fontSize: 12.5, color: "var(--p-muted)", lineHeight: 1.55, margin: 0, padding: "10px 12px", borderRadius: 10, background: "color-mix(in srgb, #d98324 8%, transparent)" }}>
              O lead mais antigo da fila espera há {espera(p.esperaMaxMin)}. Depois de 24 horas a chance de resposta cai bastante — vale reabrir o contato.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function Bloco({ titulo, valor, nota }: { titulo: string; valor: string; nota: { texto: string; cor: string } | null }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--p-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>{titulo}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginTop: 3 }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: "var(--p-text)", letterSpacing: "-0.02em" }}>{valor}</span>
        {nota && <span style={{ fontSize: 12, fontWeight: 600, color: nota.cor }}>{nota.texto}</span>}
      </div>
    </div>
  );
}

function Caixa({ k, v, alerta, critico }: { k: string; v: string; alerta?: boolean; critico?: boolean }) {
  const cor = critico ? "var(--p-crit, #dc2626)" : alerta ? "#d98324" : "var(--p-text)";
  return (
    <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--p-border)" }}>
      <div style={{ fontSize: 11, color: "var(--p-muted)" }}>{k}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: cor, marginTop: 2 }}>{v}</div>
    </div>
  );
}

function Cell({ k, v, icon, alerta, critico }: { k: string; v: string; icon?: React.ReactNode; alerta?: boolean; critico?: boolean }) {
  return (
    <div className="p-metric">
      <div className="k" style={{ display: "flex", alignItems: "center", gap: 5 }}>{icon}{k}</div>
      <div className="v" style={{ color: critico ? "var(--p-crit, #dc2626)" : alerta ? "#d98324" : "var(--p-text)" }}>{v}</div>
    </div>
  );
}

function Mini({ k, v, alerta, critico }: { k: string; v: string; alerta?: boolean; critico?: boolean }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: critico ? "var(--p-crit, #dc2626)" : alerta ? "#d98324" : "var(--p-text)", fontVariantNumeric: "tabular-nums" }}>{v}</span>
      <span style={{ fontSize: 10, color: "var(--p-muted)" }}>{k}</span>
    </span>
  );
}
