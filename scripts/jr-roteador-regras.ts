/**
 * Regras determinísticas da JR. Ficam aqui em TS só para serem versionadas e
 * testadas — o que vale em produção é a cópia gravada em
 * PricingConfig.rules.roteador (ver jr-roteador-aplicar.ts).
 */
export const REGRAS_JR = [
  {
    id: "fogao_ambiguo",
    // Pede churrasqueira + fogão…
    quando: "(churrasqueir|prime|gourmet|tradicao|parrilla|popular)[^.!?]{0,60}(fogao|campeir)|(fogao|campeir)[^.!?]{0,60}churrasqueir",
    // …sem dizer QUAL dos dois. Sem \b no FIM: "embutid\b" não casa "embutido".
    excetoSe: "\\b(\\d\\s*bocas?|campeirinho|embutid|acoplad|integrad|dentro d(a churrasqueira|ela|o forno)|por dentro|bifeteira|a gas|lado aberto|em balanco|do lado|ao lado|separad|largura|altura|profundidade|medida|\\bcano\\b|duto|chamine|peso|bucha|parafuso|chapa|grelha|espessura|quantos espetos)",
    // Não repetir a pergunta que já saiu.
    sóSeInédito: "embutido na propria churrasqueira",
    responder: "{nome}, só pra eu te mostrar o certo: o fogão você quer embutido na própria churrasqueira, ou um Fogão Campeiro separado, do lado dela?",
    // A MESMA pergunta, nas palavras do modelo. Quando o cliente já especificou,
    // ela não pode sair — nem se ele resolver fazê-la sozinho.
    assinatura: "embutid[^.?!]{0,90}(separad|do lado|ao lado|campeir)|campeir[^.?!]{0,90}embutid",
  },
];
