// ── Preenchimento de desenvolvimento ──────────────────────────────────────────
// Digitar link, e-mail e senha num teclado de iPhone a cada recarga do Metro é
// atrito puro — e o link do painel não é digitável de cabeça.
//
// Isto NÃO é um atalho de autenticação: quem decide continua sendo o servidor,
// que valida a senha na mesma rota de sempre. É só o formulário já vir escrito.
//
// Duas travas para nunca vazar para o cliente:
//   1. `__DEV__` — some inteiro num build de release (o bundler remove o ramo);
//   2. os valores vêm de `.env.local`, que é ignorado pelo git e não vai no build.
//
// Ver `core/api-base`: mesmo em desenvolvimento, apontar para host de produção é
// recusado. Isto aqui só serve para banco local.

export interface Prefill {
  link: string;
  email: string;
  senha: string;
}

const VAZIO: Prefill = { link: "", email: "", senha: "" };

export function devPrefill(): Prefill {
  if (!__DEV__) return VAZIO;
  return {
    link: process.env.EXPO_PUBLIC_DEV_LINK ?? "",
    email: process.env.EXPO_PUBLIC_DEV_EMAIL ?? "",
    senha: process.env.EXPO_PUBLIC_DEV_SENHA ?? "",
  };
}

/** Há preenchimento? Usado só para mostrar o aviso de que a tela está em modo dev. */
export const temPrefill = (p: Prefill): boolean => p.link.length > 0;
