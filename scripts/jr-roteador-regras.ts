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
  {
    id: "modelo_nomeado_sem_foto",
    // Grupo 1 = o termo que vai para o enviar_foto. Modelos reais da JR.
    quando: "\\b((?:churrasqueira\\s+)?(?:prime\\s*\\d{1,2}(?:\\s*espetos?)?|gourmet\\s+supreme|tradicao\\s+gourmet|gourmet|tradicao|parrilla\\s*\\d{2,3}|parrilla|popular|campeirinho|fogao\\s+campeiro\\s+de\\s+\\d\\s*bocas|forno\\s+napoli|bancada\\s+gourmet))\\b",
    // Não garante a foto quando ele está PERGUNTANDO um dado — aí ele quer a
    // resposta, não uma imagem. Nem quando pede o catálogo (é outro caminho).
    excetoSe: "\\b(largura|altura|profundidade|medida|peso|quanto custa|qual o valor|preco|preço|cabe|catalogo|cat[áa]logo|or[çc]amento|frete|entrega|montagem)",
    responder: "",
    garantirFerramenta: "enviar_foto",
  },
  {
    id: "confirmou_catalogo",
    // Caso real: ela oferece "modelo específico ou catálogo completo?", o
    // cliente responde "pode mandar" — e ela REPETE a pergunta. A conversa trava.
    quando: "^\\s*(pode (mandar|enviar|sim)|manda|me manda|envia|quero (ver|sim|o cat)|sim,? ?(pode|quero|manda)?|isso|por favor|beleza|blz|ok)\\b",
    // Sem o catálogo ter sido oferecido, "pode mandar" não quer dizer nada.
    sóSeJáDito: "catalogo completo",
    responder: "",
    garantirFerramenta: "enviar_catalogo",
    garantirArgs: { categoria: "churrasqueira" },
  },
];
