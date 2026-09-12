"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Users } from "lucide-react";

// ── Escolher o número ────────────────────────────────────────────────────────
// Os atalhos de WhatsApp e Funil, num cliente com vários números, param de ir
// direto e abrem a lista: "de quem você quer ver?".
//
// A lista abre COLADA no atalho, não no meio da tela. Um diálogo centralizado
// interrompe — cobre tudo, pede atenção e tem que ser fechado. Isto aqui é
// navegação: nasce de onde foi tocado, e escolher já leva embora.
//
// Um cliente de um número só nunca vê isto: o atalho volta a ser um link.

export interface NumeroPortal { id: string; nome: string; equipe: string | null; dono: string | null }

/** Carrega os números do cliente. Lista vazia enquanto não sabe. */
export function useNumerosDoPortal(token: string): NumeroPortal[] {
  const [numeros, setNumeros] = useState<NumeroPortal[]>([]);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/portal/${token}/numeros`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && d?.numeros) setNumeros(d.numeros); })
      .catch(() => { /* sem a lista, o atalho segue como link direto */ });
    return () => { vivo = false; };
  }, [token]);
  return numeros;
}

/** Agrupa por equipe quando existe: seis nomes soltos não dizem quem é de onde. */
function agrupar(numeros: NumeroPortal[]) {
  const equipes = [...new Set(numeros.map((n) => n.equipe).filter(Boolean) as string[])];
  if (!equipes.length) return [{ equipe: null as string | null, itens: numeros }];
  return [
    ...equipes.map((e) => ({ equipe: e as string | null, itens: numeros.filter((n) => n.equipe === e) })),
    ...(numeros.some((n) => !n.equipe) ? [{ equipe: null as string | null, itens: numeros.filter((n) => !n.equipe) }] : []),
  ];
}

function useIrPara(token: string, base: string, onFechar: () => void) {
  const router = useRouter();
  return (id: string | null) => {
    onFechar();
    router.push(`/r/${token}${base}${id ? `?conexao=${id}` : ""}`);
  };
}

// ── Menu lateral: abre DENTRO da navegação, empurrando o resto ───────────────
// Não flutua por cima: cresce no lugar, como uma pasta que abre. Assim a barra
// lateral continua sendo uma lista só, e não uma lista com um pop-up.
export function NumerosInline({ token, numeros, base, atual, onFechar }: {
  token: string; numeros: NumeroPortal[]; base: string; atual?: string | null; onFechar: () => void;
}) {
  const ir = useIrPara(token, base, onFechar);
  return (
    <div role="group" aria-label="Escolher número"
      style={{ margin: "1px 0 4px 10px", paddingLeft: 10, borderLeft: "1.5px solid var(--p-border)", display: "flex", flexDirection: "column", gap: 1 }}>
      <Opcao nome="Todos" detalhe={`${numeros.length} números`} on={!atual} onClick={() => ir(null)} icone={<Users size={13} />} compacto />
      {agrupar(numeros).map((g) => (
        <div key={g.equipe ?? "_"}>
          {g.equipe && (
            <div style={{ fontSize: 9.5, fontWeight: 700, color: "var(--p-muted)", textTransform: "uppercase", letterSpacing: 0.6, padding: "7px 8px 3px", opacity: 0.75 }}>
              {g.equipe}
            </div>
          )}
          {g.itens.map((n) => (
            <Opcao key={n.id} nome={n.nome} on={atual === n.id} onClick={() => ir(n.id)} compacto />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Barra do celular: sobe a partir do atalho tocado ─────────────────────────
// A barra vive no rodapé, então "abaixo dele" é para cima — o menu nasce em
// cima do ícone e aponta para ele. Sai da tela junto com um toque fora.
export function NumerosPopover({ token, numeros, base, atual, onFechar, ancoraEsq, ancoraLargura }: {
  token: string; numeros: NumeroPortal[]; base: string; atual?: string | null;
  onFechar: () => void;
  /** Centro horizontal do atalho tocado, em px da janela. */
  ancoraEsq: number;
  ancoraLargura: number;
}) {
  const ir = useIrPara(token, base, onFechar);
  const ref = useRef<HTMLDivElement>(null);
  const [esq, setEsq] = useState<number | null>(null);

  // Fica preso ao atalho, mas sem passar da borda da tela.
  useEffect(() => {
    const l = ref.current?.offsetWidth ?? 240;
    const centro = ancoraEsq + ancoraLargura / 2;
    setEsq(Math.max(12, Math.min(window.innerWidth - l - 12, centro - l / 2)));
  }, [ancoraEsq, ancoraLargura]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFechar]);

  return (
    <>
      <style>{`
        .pnumpop{animation:pnumpop .2s cubic-bezier(.22,1,.36,1)}
        @keyframes pnumpop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
        @media(prefers-reduced-motion:reduce){ .pnumpop{animation:none} }
      `}</style>
      <div onClick={onFechar} style={{ position: "fixed", inset: 0, zIndex: 200 }} />
      <div ref={ref} role="menu" aria-label="Escolher número" className="pnumpop"
        style={{
          position: "fixed", zIndex: 201,
          left: esq ?? ancoraEsq, visibility: esq == null ? "hidden" : "visible",
          bottom: "calc(78px + env(safe-area-inset-bottom))",
          width: "min(248px, calc(100vw - 24px))", maxHeight: "min(56vh, 380px)", overflowY: "auto",
          background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 14,
          boxShadow: "0 12px 34px rgba(0,0,0,.22)", padding: 5,
        }}>
        <Opcao nome="Todos" detalhe={`${numeros.length} números`} on={!atual} onClick={() => ir(null)} icone={<Users size={14} />} />
        {agrupar(numeros).map((g) => (
          <div key={g.equipe ?? "_"}>
            {g.equipe && (
              <div style={{ fontSize: 9.5, fontWeight: 700, color: "var(--p-muted)", textTransform: "uppercase", letterSpacing: 0.6, padding: "8px 9px 3px", opacity: 0.75 }}>
                {g.equipe}
              </div>
            )}
            {g.itens.map((n) => <Opcao key={n.id} nome={n.nome} on={atual === n.id} onClick={() => ir(n.id)} />)}
          </div>
        ))}
      </div>
    </>
  );
}

function Opcao({ nome, detalhe, on, onClick, icone, compacto }: {
  nome: string; detalhe?: string; on: boolean; onClick: () => void;
  icone?: React.ReactNode; compacto?: boolean;
}) {
  return (
    <button type="button" role="menuitem" onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%",
        padding: compacto ? "6px 8px" : "9px 10px", borderRadius: 8,
        border: "none", cursor: "pointer", textAlign: "left", font: "inherit",
        background: on ? "var(--p-accent-soft)" : "transparent",
        color: on ? "var(--p-accent)" : "var(--p-text)",
      }}>
      {icone}
      <span style={{ flex: 1, minWidth: 0, fontSize: compacto ? 12.5 : 13.5, fontWeight: on ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {nome}
      </span>
      {detalhe && <span style={{ fontSize: 10.5, color: "var(--p-muted)", flexShrink: 0 }}>{detalhe}</span>}
      {on && <Check size={13} style={{ flexShrink: 0 }} />}
    </button>
  );
}
