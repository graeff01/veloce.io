// ── O que a folha de campanhas precisa saber ─────────────────────────────────
// A folha é uma rota separada e não tem a lista de conversas carregada. Em vez
// de passar dezenas de nomes pela URL (que ficaria enorme e apareceria em log de
// navegação), a caixa de entrada deixa aqui o que já calculou.
//
// É memória de processo, some com o app, e não guarda nada de identificável —
// só nome de campanha e contagem.

export interface CampanhaContada { nome: string; total: number }

let campanhas: CampanhaContada[] = [];

export const guardarCampanhas = (v: CampanhaContada[]): void => { campanhas = v; };
export const lerCampanhas = (): CampanhaContada[] => campanhas;
