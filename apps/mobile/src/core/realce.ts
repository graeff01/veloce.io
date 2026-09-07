// ── Fatiar texto pelo trecho buscado ─────────────────────────────────────────
// Puro, sem React Native: fica em `core` para poder ser testado sem aparelho —
// a mesma divisão que o resto do projeto usa.

export interface Fatia { trecho: string; casa: boolean }

/** Divide o texto nos trechos que casam, preservando as maiúsculas do original. */
export function fatiar(texto: string, termo: string): Fatia[] {
  const alvo = termo.trim().toLowerCase();
  if (!alvo) return [{ trecho: texto, casa: false }];

  const partes: Fatia[] = [];
  const base = texto.toLowerCase();
  let i = 0;
  for (;;) {
    const achou = base.indexOf(alvo, i);
    if (achou === -1) break;
    if (achou > i) partes.push({ trecho: texto.slice(i, achou), casa: false });
    partes.push({ trecho: texto.slice(achou, achou + alvo.length), casa: true });
    i = achou + alvo.length;
  }
  if (i < texto.length) partes.push({ trecho: texto.slice(i), casa: false });
  return partes.length ? partes : [{ trecho: texto, casa: false }];
}
