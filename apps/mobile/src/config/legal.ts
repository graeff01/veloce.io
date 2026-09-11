// ── Documentos legais ─────────────────────────────────────────────────────────
// As páginas vivem no PRÓPRIO backend (rotas do Next), então as URLs são
// derivadas da base em uso. Nada de domínio cravado no binário: o app aponta
// para o servidor ao qual está vinculado, e a regra de segurança do projeto —
// nenhuma URL de produção dentro do código — continua valendo.

export interface Documento {
  titulo: string;
  caminho: string;
  /** Explica ao usuário o que ele encontra ali, em uma linha. */
  resumo: string;
}

export const DOCUMENTOS: Documento[] = [
  {
    titulo: "Política de Privacidade",
    caminho: "/privacy",
    resumo: "Quais dados tratamos, por quanto tempo e com quem compartilhamos.",
  },
  {
    titulo: "Termos de Uso",
    caminho: "/termos",
    resumo: "As regras de uso do aplicativo e do portal.",
  },
  {
    titulo: "Exclusão de dados",
    caminho: "/exclusao-de-dados",
    resumo: "Como pedir a remoção da sua conta e dos seus dados.",
  },
];

/** URL completa de um documento, a partir da base atual da API. */
export function urlDoDocumento(base: string, caminho: string): string {
  return `${base.replace(/\/+$/, "")}${caminho}`;
}
