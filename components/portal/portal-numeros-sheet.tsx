"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Smartphone, X, Check, Users } from "lucide-react";

// ── Escolher o número (folha compartilhada) ──────────────────────────────────
// Os atalhos de WhatsApp e Funil, para um cliente com vários números, param de
// ir direto e abrem ESTA lista: "de quem você quer ver?".
//
// A alternativa — abas com os nomes dentro da própria tela — foi o que existia
// antes e ocupava uma faixa inteira acima da lista, em toda tela, o tempo todo.
// Aqui a escolha aparece quando é feita e some depois, e a tela fica com o
// conteúdo, que é o que a pessoa veio ver.
//
// Um cliente de um número só nunca vê isto: o atalho volta a ser um link.

export interface NumeroPortal { id: string; nome: string; equipe: string | null; dono: string | null }

/** Carrega os números do cliente. Devolve lista vazia enquanto não sabe. */
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

export function PortalNumerosSheet({ token, numeros, base, rotulo, atual, aberto, onFechar }: {
  token: string;
  numeros: NumeroPortal[];
  /** Caminho de destino a partir de /r/<token> — "/conversas" ou "/funil". */
  base: string;
  /** O que se está escolhendo, para o título fazer sentido. */
  rotulo: string;
  /** Número já selecionado, se houver. */
  atual?: string | null;
  aberto: boolean;
  onFechar: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  const ir = (id: string | null) => {
    onFechar();
    router.push(`/r/${token}${base}${id ? `?conexao=${id}` : ""}`);
  };

  // Agrupa por equipe quando existe: numa operação com consultoria e captação,
  // seis nomes soltos não dizem quem é de onde.
  const equipes = [...new Set(numeros.map((n) => n.equipe).filter(Boolean) as string[])];
  const grupos: { equipe: string | null; itens: NumeroPortal[] }[] = equipes.length
    ? [...equipes.map((e) => ({ equipe: e, itens: numeros.filter((n) => n.equipe === e) })),
       ...(numeros.some((n) => !n.equipe) ? [{ equipe: null, itens: numeros.filter((n) => !n.equipe) }] : [])]
    : [{ equipe: null, itens: numeros }];

  return (
    <>
      <style>{`
        .pnum-sheet{animation:pnumUp .26s cubic-bezier(.22,1,.36,1)}
        @keyframes pnumUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @media(prefers-reduced-motion:reduce){ .pnum-sheet{animation:none} }
      `}</style>
      <div onClick={onFechar} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.38)" }} />
      <div role="dialog" aria-label={`Escolher ${rotulo}`} className="pnum-sheet"
        style={{
          position: "fixed", zIndex: 201, left: "50%", top: "50%", transform: "translate(-50%,-50%)",
          width: "min(400px, calc(100vw - 32px))", maxHeight: "min(70vh, 560px)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 16,
          boxShadow: "0 24px 64px rgba(0,0,0,.3)",
        }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 16px", borderBottom: "1px solid var(--p-border)" }}>
          <Smartphone size={16} style={{ color: "var(--p-accent)" }} />
          <strong style={{ flex: 1, fontSize: 14.5, color: "var(--p-text)" }}>{rotulo}</strong>
          <button onClick={onFechar} aria-label="Fechar"
            style={{ display: "inline-flex", border: "none", background: "transparent", color: "var(--wa-muted)", cursor: "pointer", padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: 6 }}>
          <Linha nome="Todos" detalhe={`${numeros.length} números`} on={!atual} onClick={() => ir(null)} icone={<Users size={15} />} />
          {grupos.map((g) => (
            <div key={g.equipe ?? "_"}>
              {g.equipe && (
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--wa-muted)", textTransform: "uppercase", letterSpacing: 0.5, padding: "10px 10px 4px" }}>
                  {g.equipe}
                </div>
              )}
              {g.itens.map((n) => (
                <Linha key={n.id} nome={n.nome} detalhe={n.dono ?? undefined} on={atual === n.id} onClick={() => ir(n.id)} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Linha({ nome, detalhe, on, onClick, icone }: {
  nome: string; detalhe?: string; on: boolean; onClick: () => void; icone?: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px",
        border: "none", borderRadius: 10, cursor: "pointer", textAlign: "left",
        background: on ? "var(--p-accent-soft)" : "transparent",
        color: on ? "var(--p-accent)" : "var(--p-text)",
      }}>
      {icone}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: on ? 700 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nome}</span>
        {detalhe && (
          <span style={{ display: "block", fontSize: 11, color: "var(--wa-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detalhe}</span>
        )}
      </span>
      {on && <Check size={15} style={{ flexShrink: 0 }} />}
    </button>
  );
}
