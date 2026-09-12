"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PortalConectarNumero } from "@/components/portal/portal-conectar-numero";
import { AlertTriangle, X, ChevronRight, Check, Timer, MessageSquareOff, PlugZap, Unplug } from "lucide-react";

// ── Equipe: o que o gestor DECIDE ────────────────────────────────────────────
// Esta tela mostrava convertidos, receita e qualificados — as perguntas do
// Funil, ditas de outro jeito. Número repetido em duas telas não informa duas
// vezes: faz duvidar de qual está certa. Conversão e receita ficaram no Funil.
//
// Aqui é tempo e fila, e o que sai disso. A tela abre pelo que precisa de ação,
// não por uma tabela que a pessoa tem que interpretar sozinha.
//
// VISUAL: tudo mora no sistema do portal (.p-panel, .p-phead, .p-metrics,
// .p-table, .p-pill) e nos tokens de cor (--p-crit-soft, --p-warn-soft…). O
// painel NÃO tem padding próprio — conteúdo solto dentro dele encosta na borda,
// que foi exatamente o que deixou esta tela desalinhada na primeira versão.

interface Pessoa {
  email: string; nome: string; equipe: string | null;
  leads: number; esperando: number; esperaMaxMin: number; semResposta: number;
  primeiraRespostaSec: number | null; respostaSec: number | null;
}
interface Grupo { equipe: string; leads: number; esperando: number; esperaMaxMin: number; semResposta: number; primeiraRespostaSec: number | null; respostaSec: number | null }
interface Gargalo { tipo: string; gravidade: "alta" | "media"; titulo: string; detalhe: string; pessoa?: string }
interface Geral { leads: number; esperando: number; semResposta: number; primeiraRespostaSec: number | null; respostaSec: number | null }
interface Mudo { nome: string; dono: string | null; horas: number }
interface SemToken { nome: string; dono: string | null; erro: string; horas: number }
interface Hora { hora: number; leads: number; primeiraRespostaSec: number | null }
interface Anterior { leads: number; primeiraRespostaSec: number | null }
interface HorarioFraco { deHora: number; ateHora: number; leads: number; fatia: number; primeiraRespostaSec: number }
interface Dados {
  periodLabel: string; geral: Geral | null; pessoas: Pessoa[]; equipes: Grupo[] | null;
  gargalos: Gargalo[]; mudos?: Mudo[]; semToken?: SemToken[]; anterior?: Anterior | null; horas?: Hora[]; horarioFraco?: HorarioFraco | null;
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
// Uma escala só, consumida pela cor da barra E pela legenda. Duas definições
// fariam a legenda mentir sobre o gráfico ao lado dela.
const FAIXAS = [
  { ate: 30 * 60, rotulo: "até 30min", cor: "var(--p-good)" },
  { ate: 2 * 3600, rotulo: "até 2h", cor: "var(--p-warn)" },
  { ate: Infinity, rotulo: "mais de 2h", cor: "var(--p-crit)" },
] as const;
const faixaDe = (sec: number | null) =>
  sec == null ? null : FAIXAS.find((f) => sec <= f.ate)!;

function inicial(nome: string) { return nome.trim()[0]?.toUpperCase() ?? "?"; }
function corDoNome(nome: string) {
  let h = 0; for (const c of nome) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 38% 48%)`;
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
  // Quem está com o número mudo. A fila vazia dessa pessoa não é mérito — é
  // consequência de nada estar chegando, e a tela precisa dizer isso.
  const mudoDe = (email: string) => (d?.mudos ?? []).find((m) => m.dono === email) ?? null;
  // Token recusado é pior que número mudo: aqui as mensagens CONTINUAM chegando,
  // então a linha da pessoa fica com números normais e nada denuncia o problema.
  const semTokenDe = (email: string) => (d?.semToken ?? []).find((t) => t.dono === email) ?? null;
  /** Caminho da Equipe para a caixa, já recortada no caso que motivou o clique. */
  /**
   * Comparação com o período anterior, em PALAVRA — a cor é reforço, não o
   * recado. Sem base de comparação não devolve nada: inventar "0%" faria parecer
   * estabilidade onde não há histórico.
   *
   * Atenção ao sentido: em TEMPO, cair é melhorar. Usar o verde de "subiu" aqui
   * diria o contrário do que aconteceu.
   */
  const tendencia = (agora: number | null, antes: number | null) => {
    if (agora == null || antes == null || antes === 0) return null;
    const dif = agora - antes;
    const pct = Math.round((dif / antes) * 100);
    if (Math.abs(pct) < 10) return { texto: "estável", classe: "flat" as const };
    return dif < 0
      ? { texto: `${dur(Math.abs(dif))} mais rápido`, classe: "up" as const }
      : { texto: `${dur(dif)} mais lento`, classe: "down" as const };
  };

  const rota = (estado: "sem-resposta" | "aguardando", dono?: string | null) =>
    `/r/${token}/conversas?estado=${estado}${dono ? `&dono=${encodeURIComponent(dono)}` : ""}`;

  return (
    <div>
      <style>{`
        /* Uma linha de pessoa é um objeto repetido: mesmas bordas, mesma altura,
           cada coisa sempre no mesmo lugar. */
        .eq-linha{display:flex;align-items:center;gap:12px;width:100%;padding:12px 18px;
          border:none;border-bottom:1px solid var(--p-border);background:transparent;
          cursor:pointer;font:inherit;text-align:left;transition:background .15s}
        .eq-linha:last-child{border-bottom:none}
        .eq-linha:hover{background:var(--p-raise)}
        .eq-av{width:32px;height:32px;border-radius:50%;flex-shrink:0;color:#fff;
          display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:13px}
        .eq-nums{display:flex;gap:20px;flex-shrink:0;font-variant-numeric:tabular-nums}
        .eq-num{display:inline-flex;flex-direction:column;align-items:flex-end;gap:2px;min-width:46px}
        .eq-num b{font-size:14px;font-weight:700;line-height:1;color:var(--p-text)}
        .eq-num span{font-size:10px;color:var(--p-muted);white-space:nowrap}
        /* Alerta: cartão com faixa de severidade à esquerda, não uma caixa
           colorida inteira — a cor marca a gravidade, não pinta a informação. */
        .eq-alerta{display:flex;align-items:flex-start;gap:12px;width:100%;text-align:left;
          padding:14px 18px;border:none;border-bottom:1px solid var(--p-border);
          background:transparent;font:inherit;transition:background .15s}
        .eq-alerta:last-child{border-bottom:none}
        .eq-alerta[data-click="1"]{cursor:pointer}
        .eq-alerta[data-click="1"]:hover{background:var(--p-raise)}
        .eq-faixa{width:3px;align-self:stretch;border-radius:3px;flex-shrink:0}
        @media(max-width:700px){
          .eq-nums{gap:14px}
          .eq-num:nth-child(n+3){display:none}
          .eq-linha,.eq-alerta{padding-left:14px;padding-right:14px}
        }
      `}</style>

      {/* Topo */}
      <div style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", alignItems: "center", gap: 14, padding: "14px 26px", borderBottom: "1px solid var(--p-border)", background: "color-mix(in srgb, var(--p-bg) 82%, transparent)", backdropFilter: "saturate(180%) blur(12px)" }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="pm-titulo-conteudo" style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, color: "var(--p-text)" }}>Equipe</h1>
          <div style={{ color: "var(--p-muted)", fontSize: 12.5 }}>Tempo de atendimento e fila · {d?.periodLabel ?? "—"}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 9, padding: 3, flexShrink: 0 }}>
          {PERIODS.map((p) => <button key={p.v} onClick={() => setPeriod(p.v)} style={period === p.v ? segOn : seg}>{p.label}</button>)}
        </div>
      </div>

      <div className="p-wrap">
        {loading ? (
          <div className="p-panel" style={{ padding: 28, color: "var(--p-muted)", fontSize: 13 }}>Carregando…</div>
        ) : pessoas.length === 0 ? (
          <div className="p-panel" style={{ padding: 28, textAlign: "center", color: "var(--p-muted)", fontSize: 13.5, lineHeight: 1.6 }}>
            Ainda não há atendimento para medir.<br />
            Assim que as conversas começarem a chegar, o tempo de resposta e a fila aparecem aqui.
          </div>
        ) : (
          <>
            {/* ── Precisa de ação ──────────────────────────────────────────
                Primeiro na tela: é a única parte que pede decisão hoje.
                Quando não há nada, a ausência também é notícia. */}
            <div className="p-panel">
              <div className="p-phead">
                <h2>Precisa de ação</h2>
                {d!.gargalos.length > 0 && (
                  <span className={`p-pill ${d!.gargalos.some((g) => g.gravidade === "alta") ? "crit" : "warn"}`}>
                    {d!.gargalos.length}
                  </span>
                )}
                <span className="hint">{d!.periodLabel}</span>
              </div>
              {d!.gargalos.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "18px" }}>
                  <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: "var(--p-good-soft)", color: "var(--p-good)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <Check size={16} />
                  </span>
                  <span style={{ fontSize: 13.5, color: "var(--p-text)", lineHeight: 1.5 }}>
                    Nada travado agora — nenhum lead sem resposta e ninguém fora da curva.
                  </span>
                </div>
              ) : (
                d!.gargalos.map((g, i) => {
                  const grave = g.gravidade === "alta";
                  const cor = grave ? "var(--p-crit)" : "var(--p-warn)";
                  const fundo = grave ? "var(--p-crit-soft)" : "var(--p-warn-soft)";
                  const pessoa = pessoas.find((p) => p.email === g.pessoa);
                  // Onde o alerta LEVA. Um diagnóstico que não abre as conversas
                  // deixa a gestora com o número e sem o caso: ela vê "12 leads
                  // nunca responderam" e não tem como chegar em nenhum deles.
                  const destino = g.tipo === "sem_resposta" ? rota("sem-resposta", g.pessoa)
                    : g.tipo === "espera_longa" || g.tipo === "fila_concentrada" ? rota("aguardando", g.pessoa)
                    : null;
                  const corpo = (
                    <>
                      <span className="eq-faixa" style={{ background: cor }} />
                      <span style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: fundo, color: cor, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        {g.tipo === "token_quebrado" ? <Unplug size={15} />
                          : g.tipo === "numero_mudo" ? <PlugZap size={15} />
                          : g.tipo === "sem_resposta" ? <MessageSquareOff size={15} />
                          : g.tipo === "espera_longa" ? <Timer size={15} />
                          : <AlertTriangle size={15} />}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--p-text)", letterSpacing: "-0.01em" }}>{g.titulo}</span>
                        <span style={{ display: "block", fontSize: 12.5, color: "var(--p-muted)", lineHeight: 1.55, marginTop: 3, maxWidth: "62ch" }}>{g.detalhe}</span>
                      </span>
                      {(destino || pessoa) && <ChevronRight size={16} style={{ color: "var(--p-muted)", flexShrink: 0, alignSelf: "center" }} />}
                    </>
                  );
                  // Número mudo não leva a lugar nenhum na caixa: não há
                  // conversa para abrir — é justamente o problema.
                  if (destino) {
                    return <Link key={i} href={destino} prefetch className="eq-alerta" data-click="1" style={{ textDecoration: "none" }}>{corpo}</Link>;
                  }
                  return (
                    <button key={i} className="eq-alerta" data-click={pessoa ? "1" : "0"}
                      onClick={() => pessoa && setAberta(pessoa)} disabled={!pessoa}>{corpo}</button>
                  );
                })
              )}
            </div>

            {/* ── Tempos do time ──────────────────────────────────────────── */}
            {geral && (
              <div className="p-panel">
                <div className="p-phead"><h2>Tempos</h2><span className="hint">mediana, não média</span></div>
                <div className="p-metrics">
                  <Metrica k="1ª resposta" v={dur(geral.primeiraRespostaSec)}
                    rodape="até alguém atender o lead novo"
                    tendencia={tendencia(geral.primeiraRespostaSec, d!.anterior?.primeiraRespostaSec ?? null)} />
                  <Metrica k="Resposta seguinte" v={dur(geral.respostaSec)} rodape="a cada vez que ele escreve depois" />
                  <Metrica k="Aguardando agora" v={String(geral.esperando)} tom={geral.esperando > 0 ? "warn" : undefined} rodape="lead falou, ninguém voltou" />
                  <Metrica k="Sem resposta" v={String(geral.semResposta)} tom={geral.semResposta > 0 ? "crit" : undefined} rodape="nunca receberam nada" />
                </div>
              </div>
            )}

            {/* ── Horários ────────────────────────────────────────────────
                Decisão de ESCALA, não de cobrança: se um terço dos leads cai
                depois das 19h e ninguém está atendendo, o problema é o turno.
                O dado sempre existiu, diluído dentro da média do dia. */}
            {d!.horas && d!.horas.filter((h) => h.leads > 0).length >= 3 && (
              <div className="p-panel">
                <div className="p-phead"><h2>Horários</h2><span className="hint">quando chega, quando é atendido</span></div>

                {d!.horarioFraco && (
                  // O recado em PALAVRA, antes do gráfico: é ele que vira
                  // decisão. O gráfico mostra a forma; a frase diz o que fazer.
                  <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--p-border)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <span style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: "var(--p-warn-soft)", color: "var(--p-warn)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        <Timer size={15} />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--p-text)", letterSpacing: "-0.01em" }}>
                          {d!.horarioFraco.fatia}% dos leads chegam a partir das {d!.horarioFraco.deHora}h
                        </span>
                        <span style={{ display: "block", fontSize: 12.5, color: "var(--p-muted)", lineHeight: 1.55, marginTop: 3, maxWidth: "62ch" }}>
                          São {d!.horarioFraco.leads} pessoas, e nesse horário a primeira resposta leva {dur(d!.horarioFraco.primeiraRespostaSec)} —
                          contra {dur(geral?.primeiraRespostaSec ?? null)} no resto do dia. Não é lentidão de ninguém: é turno descoberto.
                        </span>
                      </span>
                    </div>
                  </div>
                )}

                <div style={{ padding: "16px 18px" }}>
                  <GraficoHoras horas={d!.horas} />
                </div>
              </div>
            )}

            {/* ── Por equipe ──────────────────────────────────────────────── */}
            {d!.equipes && d!.equipes.length > 0 && (
              <div className="p-panel">
                <div className="p-phead"><h2>Por equipe</h2></div>
                <div className="p-scroll">
                  <table className="p-table" style={{ minWidth: 520 }}>
                    <thead><tr><th>Equipe</th><th>1ª resposta</th><th>Resposta seguinte</th><th>Fila</th><th>Sem resposta</th></tr></thead>
                    <tbody>
                      {d!.equipes.map((e) => (
                        <tr key={e.equipe}>
                          <td style={{ textTransform: "capitalize", fontWeight: 650 }}>{e.equipe}</td>
                          <td className="tnum">{dur(e.primeiraRespostaSec)}</td>
                          <td className="tnum">{dur(e.respostaSec)}</td>
                          <td className="tnum">{e.esperando || "—"}</td>
                          <td className="tnum">
                            {e.semResposta > 0
                              ? <span className="p-pill crit">{e.semResposta}</span>
                              : <span style={{ color: "var(--p-muted)" }}>—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Cadastrar o WhatsApp de quem trabalha com ela. Mora aqui porque
                é aqui que a equipe dela vive — neste modelo, um número É uma
                pessoa. Só aparece para quem tem a permissão. */}
            <PortalConectarNumero token={token} onConectado={() => setPeriod((p) => p)} />

            {/* ── Pessoas ─────────────────────────────────────────────────── */}
            <div className="p-panel">
              <div className="p-phead"><h2>Pessoas</h2><span className="hint">toque para ver o detalhe</span></div>
              {pessoas.map((p) => (
                <button key={p.email} className="eq-linha" onClick={() => setAberta(p)}>
                  <span className="eq-av" style={{ background: corDoNome(p.nome) }}>{inicial(p.nome)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 650, color: "var(--p-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      {p.equipe && <span style={{ fontSize: 11.5, color: "var(--p-muted)", textTransform: "capitalize" }}>{p.equipe}</span>}
                      {/* Sem isto, quem está DESCONECTADO aparece como o melhor
                          do time: fila zero, nada esperando. O número explica. */}
                      {semTokenDe(p.email) && <span className="p-pill crit">conexão sem acesso</span>}
                      {mudoDe(p.email) && <span className="p-pill crit">WhatsApp fora do ar</span>}
                      {p.semResposta > 0 && <span className="p-pill crit">{p.semResposta} sem resposta</span>}
                      {p.semResposta === 0 && p.esperaMaxMin >= 24 * 60 && <span className="p-pill warn">espera {espera(p.esperaMaxMin)}</span>}
                    </span>
                  </span>
                  <span className="eq-nums">
                    <span className="eq-num"><b>{dur(p.primeiraRespostaSec)}</b><span>1ª resposta</span></span>
                    <span className="eq-num"><b>{dur(p.respostaSec)}</b><span>seguinte</span></span>
                    <span className="eq-num"><b>{p.esperando || "—"}</b><span>na fila</span></span>
                  </span>
                  <ChevronRight size={16} style={{ color: "var(--p-muted)", flexShrink: 0 }} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {aberta && <Detalhe p={aberta} geral={geral} mudo={mudoDe(aberta.email)} semToken={semTokenDe(aberta.email)} rota={rota} onFechar={() => setAberta(null)} />}
    </div>
  );
}

function Metrica({ k, v, tom, rodape, tendencia }: {
  k: string; v: string; tom?: "warn" | "crit"; rodape?: string;
  tendencia?: { texto: string; classe: "up" | "down" | "flat" } | null;
}) {
  return (
    <div className="p-metric">
      <div className="k">{k}</div>
      <div className="v" style={{ color: tom === "crit" ? "var(--p-crit)" : tom === "warn" ? "var(--p-warn)" : "var(--p-text)" }}>{v}</div>
      {tendencia && (
        <div style={{ marginTop: 7 }}>
          <span className={`p-chip ${tendencia.classe}`}>{tendencia.texto}</span>
        </div>
      )}
      {rodape && <div className="foot">{rodape}</div>}
    </div>
  );
}

// ── Detalhe de uma pessoa ────────────────────────────────────────────────────
// Mesmo padrão das outras abas: a lista fica limpa e o detalhe abre por cima.
function Detalhe({ p, geral, mudo, semToken, rota, onFechar }: {
  p: Pessoa; geral: Geral | null; mudo: Mudo | null; semToken: SemToken | null;
  rota: (estado: "sem-resposta" | "aguardando", dono?: string | null) => string;
  onFechar: () => void;
}) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFechar]);

  // Comparar com o time é o que transforma um número em informação: 16min é bom
  // ou ruim? Depende do que os outros fazem.
  const compara = (meu: number | null, time: number | null) => {
    if (meu == null || time == null || time === 0) return null;
    const dif = Math.round(((meu - time) / time) * 100);
    if (Math.abs(dif) < 10) return { texto: "na média do time", classe: "flat" as const };
    return dif > 0
      ? { texto: `${dif}% mais devagar`, classe: "down" as const }
      : { texto: `${-dif}% mais rápido`, classe: "up" as const };
  };

  return (
    <>
      <style>{`
        .eq-modal{animation:eqUp .22s cubic-bezier(.22,1,.36,1)}
        @keyframes eqUp{from{opacity:0;transform:translate(-50%,-46%)}to{opacity:1;transform:translate(-50%,-50%)}}
        @media(prefers-reduced-motion:reduce){ .eq-modal{animation:none} }
        .eq-cx{padding:13px 15px;border-radius:11px;border:1px solid var(--p-border);min-width:0}
        .eq-cx .k{font-size:11px;color:var(--p-muted)}
        .eq-cx .v{font-size:19px;font-weight:750;margin-top:3px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
      `}</style>
      <div onClick={onFechar} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.4)" }} />
      <div role="dialog" aria-label={`Detalhe de ${p.nome}`} className="eq-modal"
        style={{ position: "fixed", zIndex: 201, left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "min(440px, calc(100vw - 28px))", maxHeight: "min(78vh, 640px)", overflowY: "auto", background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 18, boxShadow: "0 24px 64px rgba(0,0,0,.32)" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "16px 18px", borderBottom: "1px solid var(--p-border)" }}>
          <span className="eq-av" style={{ background: corDoNome(p.nome), width: 36, height: 36, fontSize: 14, borderRadius: "50%", flexShrink: 0, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{inicial(p.nome)}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ display: "block", fontSize: 15.5, color: "var(--p-text)", letterSpacing: "-0.01em" }}>{p.nome}</strong>
            {p.equipe && <span style={{ fontSize: 11.5, color: "var(--p-muted)", textTransform: "capitalize" }}>{p.equipe}</span>}
          </span>
          <button onClick={onFechar} aria-label="Fechar" style={{ border: "none", background: "transparent", color: "var(--p-muted)", cursor: "pointer", display: "inline-flex", padding: 5, borderRadius: 8, flexShrink: 0 }}><X size={17} /></button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Grande titulo="1ª resposta" sub="até alguém atender o lead novo" valor={dur(p.primeiraRespostaSec)} nota={compara(p.primeiraRespostaSec, geral?.primeiraRespostaSec ?? null)} />
            <Grande titulo="Resposta seguinte" sub="a cada vez que o lead escreve depois" valor={dur(p.respostaSec)} nota={compara(p.respostaSec, geral?.respostaSec ?? null)} />
          </div>

          {/* Os dois números que pedem ação ABREM as conversas. Um painel que
              só informa deixa a gestora anotando num papel para procurar
              depois — e o "depois" é o que faz o lead esfriar. */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="eq-cx"><div className="k">Leads no período</div><div className="v" style={{ color: "var(--p-text)" }}>{p.leads}</div></div>
            <Caixa k="Aguardando agora" v={p.esperando || "—"} tom={p.esperando > 0 ? "warn" : undefined}
              href={p.esperando > 0 ? rota("aguardando", p.email) : null} />
            <div className="eq-cx"><div className="k">Espera mais longa</div><div className="v" style={{ color: p.esperaMaxMin >= 24 * 60 ? "var(--p-warn)" : "var(--p-text)" }}>{espera(p.esperaMaxMin)}</div></div>
            <Caixa k="Sem resposta nenhuma" v={p.semResposta || "—"} tom={p.semResposta > 0 ? "crit" : undefined}
              href={p.semResposta > 0 ? rota("sem-resposta", p.email) : null} />
          </div>

          {semToken ? (
            // Antes de qualquer leitura: os números dela estão CERTOS (as
            // mensagens chegaram), mas a conexão não consegue mais responder.
            <Nota tom="crit">
              A conexão de <b>{semToken.nome}</b> perdeu o acesso há {semToken.horas >= 48 ? `${Math.floor(semToken.horas / 24)} dias` : `${semToken.horas}h`} — {semToken.erro.toLowerCase()}.
              As mensagens continuam chegando, por isso os números acima parecem normais.
              O que não funciona é responder e abrir mídia. Precisa reconectar o número.
            </Nota>
          ) : mudo ? (
            // Antes de qualquer leitura sobre a pessoa: o canal dela está fora.
            <Nota tom="crit">
              O WhatsApp <b>{mudo.nome}</b> não recebe nada há {mudo.horas >= 48 ? `${Math.floor(mudo.horas / 24)} dias` : `${mudo.horas}h`}.
              Os números acima medem o que chegou — e não chegou nada. Reconecte antes de tirar conclusão sobre o atendimento.
            </Nota>
          ) : p.semResposta > 0 ? (
            <Nota tom="crit">
              {p.semResposta === 1 ? "Um lead escreveu e" : `${p.semResposta} leads escreveram e`} nunca {p.semResposta === 1 ? "recebeu" : "receberam"} nenhuma resposta.
              Isso não é demora — é ausência, e é o primeiro lugar para agir.
            </Nota>
          ) : p.esperaMaxMin >= 24 * 60 ? (
            <Nota tom="warn">
              O lead mais antigo da fila espera há {espera(p.esperaMaxMin)}. Depois de 24 horas a chance de resposta cai bastante — vale reabrir o contato.
            </Nota>
          ) : (
            <Nota tom="good">Nada travado com {p.nome.split(" ")[0]} no momento.</Nota>
          )}
        </div>
      </div>
    </>
  );
}

// ── Chegada por hora ────────────────────────────────────────────────────────
// ALTURA = quantos leads chegaram naquela hora. COR = quanto demorou a primeira
// resposta ali. São duas variáveis diferentes, não a mesma duas vezes — pintar
// a barra de acordo com a própria altura não acrescentaria nada.
//
// A cor NUNCA é o único sinal: há legenda com o que cada faixa significa, cada
// barra carrega os números em `aria-label` e no `title`, e o recado que importa
// está escrito em cima do gráfico. No celular não existe passar o mouse.
function GraficoHoras({ horas }: { horas: Hora[] }) {
  const max = Math.max(1, ...horas.map((h) => h.leads));
  return (
    <>
      <style>{`
        .gh{display:flex;align-items:flex-end;gap:2px;height:88px}
        .gh-col{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;height:100%}
        /* Cantos arredondados só no TOPO: a barra nasce da linha de base. */
        .gh-b{border-radius:3px 3px 0 0;min-height:2px;transition:opacity .15s}
        .gh-col:hover .gh-b{opacity:.75}
        .gh-eixo{display:flex;gap:2px;margin-top:6px;border-top:1px solid var(--p-border);padding-top:5px}
        .gh-eixo span{flex:1;min-width:0;font-size:9.5px;color:var(--p-muted);text-align:center;
          font-variant-numeric:tabular-nums;white-space:nowrap}
        .gh-leg{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}
        .gh-leg span{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--p-muted)}
        .gh-leg i{width:9px;height:9px;border-radius:2px;flex-shrink:0}
      `}</style>

      <div className="gh" role="img" aria-label="Leads recebidos por hora do dia e tempo da primeira resposta em cada hora">
        {horas.map((h) => {
          const faixa = faixaDe(h.primeiraRespostaSec);
          const alt = h.leads === 0 ? 0 : Math.max(6, Math.round((h.leads / max) * 100));
          const descricao = h.leads === 0
            ? `${h.hora}h: nenhum lead`
            : `${h.hora}h: ${h.leads} ${h.leads === 1 ? "lead" : "leads"}, 1ª resposta ${dur(h.primeiraRespostaSec)}`;
          return (
            <span key={h.hora} className="gh-col" title={descricao} aria-label={descricao}>
              <span className="gh-b" style={{
                height: `${alt}%`,
                background: h.leads === 0 ? "var(--p-border)" : (faixa?.cor ?? "var(--p-line-strong)"),
              }} />
            </span>
          );
        })}
      </div>

      <div className="gh-eixo" aria-hidden>
        {horas.map((h) => <span key={h.hora}>{h.hora % 6 === 0 ? `${h.hora}h` : ""}</span>)}
      </div>

      <div className="gh-leg">
        {FAIXAS.map((f) => (
          <span key={f.rotulo}><i style={{ background: f.cor }} />1ª resposta {f.rotulo}</span>
        ))}
        <span><i style={{ background: "var(--p-border)" }} />sem lead</span>
      </div>
    </>
  );
}

function Caixa({ k, v, tom, href }: {
  k: string; v: string | number; tom?: "warn" | "crit"; href?: string | null;
}) {
  const cor = tom === "crit" ? "var(--p-crit)" : tom === "warn" ? "var(--p-warn)" : "var(--p-text)";
  const dentro = (
    <>
      <div className="k" style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {k}{href && <ChevronRight size={11} style={{ opacity: 0.7 }} />}
      </div>
      <div className="v" style={{ color: cor }}>{v}</div>
    </>
  );
  if (!href) return <div className="eq-cx">{dentro}</div>;
  return <Link href={href} prefetch className="eq-cx" style={{ textDecoration: "none", display: "block" }}>{dentro}</Link>;
}

function Grande({ titulo, sub, valor, nota }: {
  titulo: string; sub: string; valor: string;
  nota: { texto: string; classe: "up" | "down" | "flat" } | null;
}) {
  return (
    <div>
      <div className="p-eyebrow">{titulo}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
        <span style={{ fontSize: 30, fontWeight: 780, color: "var(--p-text)", letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{valor}</span>
        {nota && <span className={`p-chip ${nota.classe}`}>{nota.texto}</span>}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--p-muted)", marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function Nota({ tom, children }: { tom: "crit" | "warn" | "good"; children: React.ReactNode }) {
  const fundo = tom === "crit" ? "var(--p-crit-soft)" : tom === "warn" ? "var(--p-warn-soft)" : "var(--p-good-soft)";
  const cor = tom === "crit" ? "var(--p-crit)" : tom === "warn" ? "var(--p-warn)" : "var(--p-good)";
  const Icone = tom === "crit" ? MessageSquareOff : tom === "warn" ? Timer : Check;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", borderRadius: 12, background: fundo }}>
      <Icone size={15} style={{ color: cor, flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 12.5, color: "var(--p-text)", lineHeight: 1.55 }}>{children}</span>
    </div>
  );
}
