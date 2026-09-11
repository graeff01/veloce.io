"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// ── Segmentos de Orçamentos (celular) ─────────────────────────────────────────
// No aplicativo, Orçamentos é UMA tela com três segmentos: A revisar · Enviados ·
// Fechamento. No portal são três páginas separadas — e, com a barra inferior
// levando só quatro módulos, Fechamento e Enviados tinham deixado de ser
// alcançáveis pelo telefone.
//
// Em vez de fundir as três páginas (que no desktop funcionam bem separadas),
// este seletor dá a MESMA navegação do app: os três estados do orçamento num
// lugar só, com o atual destacado.
//
// Some a partir de 1024px, onde o menu lateral já lista as três.

const ABAS = [
  { chave: "revisao", rotulo: "A revisar", caminho: "/revisao" },
  { chave: "orcamentos", rotulo: "Enviados", caminho: "/orcamentos" },
  { chave: "fechamento", rotulo: "Fechamento", caminho: "/fechamento" },
] as const;

export function PortalOrcamentosAbas({ token, sections }: {
  token: string;
  /** Seções do usuário: só mostra o que ele realmente alcança. */
  sections?: string[] | null;
}) {
  const pathname = usePathname() ?? "";
  const semConfiguracao = sections == null || sections.length === 0;
  const tem = (k: string) => semConfiguracao || sections.includes(k);

  // "Enviados" segue a mesma permissão de "A revisar": é o registro do que saiu.
  const visiveis = ABAS.filter((a) =>
    a.chave === "fechamento" ? tem("fechamento") : tem("revisao"));

  // Um segmento sozinho não é seletor — é um rótulo repetindo o título da barra.
  if (visiveis.length < 2) return null;

  return (
    <>
      <style>{`
        .porcabas{display:flex;gap:6px;padding:10px 14px 2px;overflow-x:auto;scrollbar-width:none;white-space:nowrap}
        @media(min-width:1024px){ .porcabas{display:none} }
      `}</style>
      <div className="porcabas" role="tablist" aria-label="Estados do orçamento">
        {visiveis.map((a) => {
          const on = pathname.endsWith(a.caminho);
          return (
            <Link
              key={a.chave}
              href={`/r/${token}${a.caminho}`}
              prefetch
              role="tab"
              aria-selected={on}
              style={{
                flexShrink: 0, padding: "6px 14px", borderRadius: 20, fontSize: 13,
                fontWeight: on ? 700 : 600, textDecoration: "none",
                background: on ? "var(--p-accent-soft)" : "transparent",
                color: on ? "var(--p-accent)" : "var(--wa-muted)",
              }}
            >
              {a.rotulo}
            </Link>
          );
        })}
      </div>
    </>
  );
}
