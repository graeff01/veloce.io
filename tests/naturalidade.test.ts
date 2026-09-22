import { test } from "node:test";
import assert from "node:assert/strict";
import { polir } from "../lib/ai-agent/naturalidade";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Todas as frases deste arquivo são RESPOSTAS REAIS da IA na JR, extraídas de
// produção (19 conversas, 273 respostas, 7–21/09/2026). O contato de cada caso
// está no comentário para dar para reabrir a conversa e conferir.

// ── 1. Pedido de permissão pra enviar o que ela mesma envia ────────────────────

test("o PDF do orçamento: pede licença 1x, envia 0x → corta a frase e dispara o envio", () => {
  // Cristofer Lenz, 05/09 11:49 — o lead respondeu "Sim" e recebeu uma FOTO.
  const r = polir("Cristofer, incluí os 5 blocos de concreto para subir a chaminé no orçamento, totalizando R$ 4.872,00, com montagem e frete para Nova Santa Rita, parcelado em até 10x sem juros no cartão.\n\nPosso te enviar o PDF com todos os detalhes?");
  assert.equal(r.acao, "enviar_orcamento", "o envio tem de acontecer, não ser oferecido");
  assert.match(r.texto, /R\$ 4\.872,00/, "o valor não pode ser perdido no corte");
  assert.doesNotMatch(r.texto, /Posso te enviar/i);
  assert.ok(r.marcas.includes("permissao:orcamento"));
});

test("a segunda tentativa do mesmo caso também dispara", () => {
  // Cristofer Lenz, 05/09 11:50:16 — terceira vez pedindo licença.
  const r = polir("Posso enviar o PDF com o orçamento completo para você analisar?");
  assert.equal(r.acao, "enviar_orcamento");
  // Era a mensagem inteira: sem texto sobrando, preserva o original (ver
  // cabeçalho do módulo) — mas a AÇÃO sai, que é o que faltava.
  assert.ok(r.marcas.includes("resto_insuficiente"));
});

test("'Posso seguir?' depois de já ter o preço na mão sai fora", () => {
  // Rochelly, 08/09 09:54 — buscar_estoque já havia devolvido R$ 6.394.
  const r = polir("Que bom que gostou, Rochelly! Agora que você já viu o vídeo, posso te mostrar o preço e os detalhes do conjunto Gourmet com Fogão Campeiro 4 bocas.\n\nPosso seguir?");
  assert.doesNotMatch(r.texto, /Posso seguir/i);
  assert.match(r.texto, /Que bom que gostou/);
  assert.ok(r.marcas.includes("permissao:licenca"));
});

test("'Você prefere que eu faça isso?' sai fora", () => {
  // Rosi Borba, 08/09 09:24 — e o orçamento nunca foi apresentado.
  const r = polir("Perfeito, Rose! Se quiser, posso montar um orçamento com a churrasqueira Popular para você agora. Você prefere que eu faça isso?");
  assert.doesNotMatch(r.texto, /prefere que eu fa/i);
  assert.match(r.texto, /Perfeito, Rose/);
});

test("oferta de FOTO sai da frase, mas não chuta qual foto enviar", () => {
  // Henrique, 05/09 14:47 — este turno também acionou sanitize:tool_call_leak.
  const r = polir("Henrique, temos várias opções de churrasqueiras que podem combinar com fogões, como a Linha Prime 9, 11 e 16 espetos, além da Parrilla nos tamanhos 81x60 e 105x60.\n\nQuer que eu te envie as fotos de algum desses modelos para você dar uma olhada?");
  assert.equal(r.acao, null, "sem o termo do modelo, disparar enviar_foto seria chute");
  assert.doesNotMatch(r.texto, /Quer que eu te envie/i);
  assert.match(r.texto, /Prime 9, 11 e 16/);
});

test("pergunta que é DECISÃO do cliente continua de pé", () => {
  // Cristofer, 05/09 — 5 blocos custam R$ 175. A escolha é dele, não tique.
  const r = polir("Cristofer, cada bloco de concreto tem 20 cm de altura e custa R$ 35.\n\nQuer que eu inclua esses 5 blocos no orçamento para subir a chaminé?");
  assert.match(r.texto, /Quer que eu inclua esses 5 blocos/, "não é pedido de licença pra enviar — é decisão de compra");
  assert.equal(r.acao, null);
});

// ── 2. Clichê de disponibilidade ──────────────────────────────────────────────

test("os clichês de fecho saem e o conteúdo fica", () => {
  const casos: [string, string][] = [
    // Cristofer, 05/09 11:45
    ["Exatamente, Cristofer! A churrasqueira Gourmet já vem com a chaminé inclusa no conjunto. Qualquer dúvida, estou aqui para ajudar!", "chaminé inclusa"],
    // Rosi, 08/09 09:24
    ["Rose, a churrasqueira Popular não vem pintada de fábrica, ela sai no tom natural do concreto. Posso ajudar com mais alguma coisa sobre isso?", "tom natural do concreto"],
    // Valdinei, 21/09 09:21
    ["Ele já já vai te chamar por aqui. Se precisar de algo mais, estou por aqui!", "vai te chamar por aqui"],
    // Rosi, 08/09 09:30
    ["Então, Rose, se precisar de qualquer coisa, é só chamar, tá? Foi um prazer ajudar você hoje! 😊", "Foi um prazer"],
  ];
  for (const [entrada, deveSobrar] of casos) {
    const r = polir(entrada);
    assert.ok(r.marcas.includes("cliche"), `não pegou o clichê em: ${entrada}`);
    assert.match(r.texto, new RegExp(deveSobrar), `perdeu conteúdo em: ${entrada}`);
  }
});

test("'Como posso te ajudar hoje?' sai — é o reset de contexto", () => {
  // Rosi, 08/09 09:27: a IA estava COLETANDO CPF/CEP e reabriu o atendimento
  // do zero, largando a coleta pela metade.
  const r = polir("Oi Rose! Sou o Juninho, da JR Churrasqueiras, fábrica em Canoas/RS. Estou aqui para ajudar você com tudo sobre churrasqueiras, fogões campeiros e lareiras. Como posso te ajudar hoje?");
  assert.doesNotMatch(r.texto, /Como posso te ajudar hoje/i);
  assert.match(r.texto, /Canoas\/RS/);
  assert.match(r.texto, /churrasqueiras, fogões campeiros e lareiras/, "a frase de ESCOPO não é clichê e deve ficar");
});

test("o 'fique à vontade' do handoff NÃO é cortado — ali tem função", () => {
  // Hamilton, 08/09 08:34 — diz ao lead que o vendedor responde o resto.
  const r = polir("Hamilton, um vendedor especializado vai entrar em contato com você em breve para ajudar com as opções de entrega para Curitiba. Fique à vontade para tirar todas as suas dúvidas com ele!");
  assert.match(r.texto, /Fique à vontade/);
  assert.equal(r.marcas.length, 0);
});

// ── 3. Uma pergunta por turno ─────────────────────────────────────────────────

test("confirmar o que o lead JÁ disse e pedir o que ele JÁ deu: corta a segunda", () => {
  // Valdinei, 21/09 09:17 — ele abriu a conversa dizendo "churrasqueira
  // Tradição" e "Joinville - SC". A IA pediu os dois de volta.
  const r = polir("Pode me confirmar se o modelo Tradição é o que você deseja?\n\nE se sim, poderia me informar a cidade e o bairro onde será feita a entrega para eu calcular o frete certinho?");
  assert.match(r.texto, /Pode me confirmar se o modelo Tradição/);
  assert.doesNotMatch(r.texto, /cidade e o bairro/);
  assert.ok(r.marcas.includes("duas_perguntas"));
});

test("duas perguntas seguidas: fica a primeira", () => {
  // Carlos Tostes, 08/09 09:02.
  const r = polir("Prazer, Carlos! Você se refere a uma churrasqueira específica? Poderia me confirmar se é uma churrasqueira Gourmet com esses acessórios?");
  assert.match(r.texto, /churrasqueira específica\?/);
  assert.doesNotMatch(r.texto, /Poderia me confirmar/);
});

test("a pergunta de ACESSO do motor tem 3 '?' e é UMA pergunta — fica inteira", () => {
  // Texto do próprio tools.ts (trava de montagem). Se este teste quebrar, a
  // pergunta que o motor exige chega mutilada ao lead.
  const p = "o local onde ela vai ficar é térreo, tem escada (quantos lances? é tradicional ou caracol) ou é por elevador?";
  const r = polir(`Cristofer, ${p}`);
  assert.match(r.texto, /quantos lances\? é tradicional ou caracol/);
  assert.ok(!r.marcas.includes("duas_perguntas"));
});

// ── 4. Frase idêntica repetida na conversa ────────────────────────────────────

test("a mesma frase não sai duas vezes na mesma conversa", () => {
  // Wilson, 08/09 09:20 e 09:21 — o par saiu duas vezes, palavra por palavra,
  // porque o lead mandou uma foto depois de já ter recebido o pedido de medidas.
  const antes = ["Que massa, Wilson! 😍 Pra eu te indicar o modelo certo pra esse espaço, me passa as medidas?"];
  const r = polir("🔥 Que massa! 😍 Pra eu te indicar o modelo certo pra esse espaço, me passa as medidas?\n\nLargura e, principalmente, a altura (pé-direito), se for área coberta.", antes);
  // A frase de medidas repetida sai; a instrução nova (largura/altura) fica.
  assert.doesNotMatch(r.texto, /me passa as medidas/);
  assert.match(r.texto, /Largura e, principalmente/);
  assert.ok(r.marcas.includes("repetida"));
});

test("vocativo curto pode repetir — não é tique", () => {
  const antes = ["Prazer, Rose!", "Ótima escolha, Rose!"];
  const r = polir("Ótima escolha, Rose! A Popular é ótima para quem busca custo-benefício.", antes);
  assert.match(r.texto, /Ótima escolha, Rose/);
  assert.ok(!r.marcas.includes("repetida"));
});

// ── Invariantes do módulo ─────────────────────────────────────────────────────

test("resposta limpa passa intacta", () => {
  // Bill Barbosa, 08/09 08:28 — atendimento bom, nada a cortar.
  const bom = "Luis Ademir, a linha Popular é ótima para quem busca custo-benefício.\n\nA Popular 65 Lisa tem as medidas aproximadas de 65 cm de largura, 55 cm de profundidade e 2,20 m de altura, incluindo a chaminé.";
  const r = polir(bom);
  assert.equal(r.texto, bom);
  assert.equal(r.marcas.length, 0);
  assert.equal(r.acao, null);
});

test("nunca devolve vazio — estilo não cala atendimento", () => {
  for (const s of ["Posso ajudar com mais alguma coisa?", "Posso seguir?", "Qualquer dúvida, estou aqui!"]) {
    const r = polir(s);
    assert.ok(r.texto.trim().length > 0, `esvaziou em: ${s}`);
    assert.ok(r.marcas.includes("resto_insuficiente"));
  }
});

test("entrada vazia/nula não explode", () => {
  for (const s of [null, undefined, "", "   "]) {
    const r = polir(s as string | null | undefined);
    assert.equal(r.marcas.length, 0);
    assert.equal(r.acao, null);
  }
});

test("a quebra de linha entre blocos sobrevive — cada linha é uma mensagem", () => {
  const r = polir("Primeira ideia aqui.\n\nSegunda ideia aqui. Qualquer dúvida, estou aqui para ajudar!");
  assert.match(r.texto, /Primeira ideia aqui\.\n\nSegunda ideia aqui\./);
});

// ── Regressões achadas MEDINDO contra as 123 respostas reais ──────────────────
// Nenhuma destas veio de raciocínio: as duas apareceram rodando o polidor sobre
// o tráfego de produção e olhando o que ele cortava.

test("'..., ok?' é entonação e não consome a vez da pergunta de verdade", () => {
  // Cristofer, 05/09 11:46. Sem esta regra, o "ok?" contava como a pergunta do
  // turno e a decisão de incluir R$ 175 em blocos era cortada como excedente.
  const r = polir("Cristofer, cada bloco de concreto tem 20 cm de altura e custa R$ 35. Para 5 metros seriam 25 blocos, mas o máximo que podemos incluir no orçamento são 5 blocos (1 metro), ok?\n\nQuer que eu inclua esses 5 blocos no orçamento para subir a chaminé?");
  assert.match(r.texto, /Quer que eu inclua esses 5 blocos/);
  assert.match(r.texto, /1 metro\), ok\?/);
  assert.ok(!r.marcas.includes("duas_perguntas"));
});

test("alternativa partida em duas frases sobrevive inteira", () => {
  // Douglas Graeff, 05/09 — "A? Ou B?" é UMA escolha. Cortar a segunda metade
  // deixava a pergunta manca, e na versão anterior disparava enviar_catalogo
  // sem o lead ter escolhido nada.
  const r = polir("Douglas, temos várias churrasqueiras com fogão que você pode gostar.\n\nQuer que eu envie a foto de algum modelo específico para você ver melhor?\n\nOu prefere que eu envie o catálogo completo de novo?");
  assert.match(r.texto, /foto de algum modelo específico/);
  assert.match(r.texto, /Ou prefere que eu envie o catálogo/);
  assert.equal(r.acao, null, "o lead ainda não escolheu — nada pode ser disparado");
});

// ── O vazamento de tool-call ganha uma segunda chance ─────────────────────────

test("tool-call vazado no texto é detectado sem o estado do regex g", () => {
  // O regex do strip tem flag `g`; usado com test() ele alterna true/false entre
  // chamadas por causa do lastIndex. O orquestrador precisa de uma cópia sem g,
  // senão a segunda chance de executar a ferramenta dispararia em dias
  // alternados. Este teste trava isso.
  const orq = readFileSync(join(process.cwd(), "lib", "ai-agent", "orchestrator.ts"), "utf8");
  assert.match(orq, /const TOOL_CALL_LEAK_TEST = new RegExp\(TOOL_CALL_LEAK_RE\.source\);/,
    "a checagem precisa de um regex sem a flag g");
  assert.match(orq, /!reTentouLeak && !toolLog\.length && TOOL_CALL_LEAK_TEST\.test\(final\)/,
    "a segunda chance só vale uma vez e só quando nenhuma ferramenta rodou");

  // E a cópia sem `g` de fato é estável entre chamadas.
  const semG = new RegExp(/(?:enviar_foto|enviar_orcamento)\s*(?:\([^\n]*?\)|\{[^\n]*\})/.source);
  const texto = "Vou te mandar: enviar_foto({\"termo\":\"gourmet\"})";
  assert.equal(semG.test(texto), true);
  assert.equal(semG.test(texto), true, "sem a flag g o resultado não pode alternar");
});

// ── Regressões achadas na VALIDAÇÃO POR REPLAY ───────────────────────────────
// Estas três não vieram da leitura das conversas nem da medição: apareceram
// rodando o pipeline real (runAgent) sobre as conversas que falharam, DEPOIS de
// a correção já estar escrita. Cada uma era um furo da própria correção.

test("vocativo recusado pelo intake não sobrevive no texto", () => {
  // Willian, 21/09: o intake recusa "Dia" e AVISA a IA — e no replay ela
  // escreveu "Dia, temos três modelos..." assim mesmo. Instrução fura; isto não.
  for (const [entrada, proibido] of [
    ["Dia, temos três modelos de fogão campeiro: o Campeirinho por R$ 1.107.", "R\\$ 1\\.107"],
    ["Prazer, Dia! Você está procurando churrasqueira, fogão campeiro ou lareira?", "Prazer!"],
    ["Ótima escolha, Dia! Trabalhamos com três modelos.", "Ótima escolha!"],
  ] as [string, string][]) {
    const r = polir(entrada, [], ["Dia"]);
    assert.doesNotMatch(r.texto, /\bDia\b/, `vocativo sobreviveu em: ${entrada}`);
    assert.match(r.texto, new RegExp(proibido), "o resto da frase tem de ficar");
    assert.ok(r.marcas.includes("vocativo_invalido"));
  }
});

test("a remoção do vocativo não toca na palavra em uso normal", () => {
  // É justamente por a palavra recusada ser comum que a remoção cega seria
  // perigosa: "bom dia" e "o seu dia" precisam sobreviver.
  const r = polir("Bom dia! Como vai o seu dia hoje?", [], ["Dia"]);
  assert.equal(r.texto, "Bom dia! Como vai o seu dia hoje?");
  assert.ok(!r.marcas.includes("vocativo_invalido"));
});

test("os clichês de fecho que escaparam no replay saem", () => {
  // Rosi, replay: os três passaram pela primeira versão dos padrões.
  const casos: [string, string][] = [
    ["Perfeito, Rose! Quando quiser, é só me falar qual modelo você gostou mais, tá? Estou aqui para ajudar!", "é só me falar qual modelo"],
    ["Tudo bem, Rose! Fico à disposição caso precise de qualquer coisa. É só chamar, tá? Um ótimo dia para você!", "Um ótimo dia para você"],
    ["Ele já já vai te chamar por aqui. Se precisar de algo mais, estou por aqui!", "vai te chamar por aqui"],
  ];
  for (const [entrada, sobra] of casos) {
    const r = polir(entrada);
    assert.ok(r.marcas.includes("cliche"), `não pegou: ${entrada}`);
    assert.match(r.texto, new RegExp(sobra));
    assert.doesNotMatch(r.texto, /estou (aqui|por aqui)|fico à disposição|é só chamar/i);
  }
});

test("a frase que apresenta o ESCOPO continua fora do corte", () => {
  const r = polir("Sou o Juninho, da JR. Estou aqui para ajudar você com tudo sobre churrasqueiras, fogões campeiros e lareiras.");
  assert.match(r.texto, /tudo sobre churrasqueiras/);
});

test("'Quer que eu envie?' acha o objeto na frase anterior", () => {
  // Rosi, replay v2: a oferta e a pergunta vieram partidas — "posso te enviar a
  // foto dessa churrasqueira. Quer que eu envie?" — e a pergunta sozinha não
  // dizia o quê, então escapava.
  const r = polir("Rose, a churrasqueira Popular comporta 4 espetos. Se quiser, posso te enviar a foto dessa churrasqueira para você conhecer melhor. Quer que eu envie?");
  assert.doesNotMatch(r.texto, /Quer que eu envie/i);
  assert.match(r.texto, /comporta 4 espetos/);
  assert.ok(r.marcas.includes("permissao:foto"));
});

test("sem objeto em nenhuma das duas frases, a pergunta fica", () => {
  // A busca na frase anterior não pode virar gatilho solto: só vale quando a
  // anterior também é oferta de envio.
  const r = polir("A entrega leva alguns dias. Quer que eu envie?");
  assert.match(r.texto, /Quer que eu envie/);
});

test("clichê com prefixo de duas orações também sai", () => {
  // Replay: "Quando quiser, é só chamar." escapou porque o prefixo de cortesia
  // só aceitava um vocativo curto.
  const r = polir("Perfeito! Quando quiser, é só chamar. Tenha um ótimo dia!");
  assert.equal(r.texto, "Perfeito! Tenha um ótimo dia!");
  assert.ok(r.marcas.includes("cliche"));
});

test("'quando/se' iniciando frase COM conteúdo não é clichê", () => {
  // A ampliação do prefixo não pode transformar condicional legítima em clichê.
  for (const t of [
    "Quando quiser, me diz qual modelo você prefere que eu já monto o orçamento.",
    "Se precisar de mais espetos, a linha Prime aceita mais.",
  ]) {
    const r = polir(t);
    assert.equal(r.texto, t, `cortou indevidamente: ${t}`);
  }
});

// ── Clichês achados no LOTE FINAL do replay ──────────────────────────────────
// Três causas estruturais quebravam a âncora `^` dos padrões, todas invisíveis
// em teste de unidade escrito à mão: emoji de abertura, vocativo no MEIO da
// frase e cauda depois do clichê.

test("emoji de abertura não escuda o clichê", () => {
  const r = polir("👍 Se precisar de algo mais, estou por aqui, Rose! Um ótimo dia para você!", [], [], "Rose");
  assert.ok(r.marcas.includes("cliche"));
  assert.equal(r.texto, "Um ótimo dia para você!");
});

test("vocativo no meio da frase não escuda o clichê", () => {
  // "estou por aqui, Rose!" e "mais alguma coisa, Cristofer, é só chamar!"
  const r = polir("Tudo bem, Rose! Quando quiser, é só chamar que eu te ajudo com o que precisar 😊 Aproveite seu dia!", [], [], "Rose");
  assert.ok(r.marcas.includes("cliche"));
  assert.match(r.texto, /Tudo bem, Rose!/);
  assert.doesNotMatch(r.texto, /é só chamar/);
});

test("a cauda depois do clichê não o salva", () => {
  const r = polir("Perfeito. É só chamar que eu te ajudo com o que precisar.", [], [], null);
  assert.ok(r.marcas.includes("cliche"));
});

test("o nome do lead não vira gatilho de corte", () => {
  // paraCasar remove o vocativo só para CASAR; a frase de conteúdo fica.
  const r = polir("Rose, a Popular comporta 4 espetos tradicionais.", [], [], "Rose");
  assert.equal(r.texto, "Rose, a Popular comporta 4 espetos tradicionais.");
  assert.equal(r.marcas.length, 0);
});

// ── Repetição da resposta INTEIRA ────────────────────────────────────────────
// Quando a resposta toda é repetição, cortar não resolve: a guarda de resto
// devolve o original e o lead lê a mesma mensagem duas vezes. O orquestrador usa
// este sinal para pedir ao modelo que AVANCE, em vez de mascarar o sintoma.
import { ehRepeticaoDe } from "../lib/ai-agent/naturalidade";

test("resposta idêntica à anterior é repetição", () => {
  // Rochelly, replay: a mesma pergunta saiu em dois turnos seguidos e a conversa
  // travou ali.
  const q = "Rochelly, você procura algum modelo específico ou prefere que eu envie o catálogo completo para você dar uma olhada? 😊";
  assert.ok(ehRepeticaoDe(q, [q]));
});

test("variação cosmética também conta", () => {
  assert.ok(ehRepeticaoDe("Olá! Qual seu nome, por favor?", ["Olá! Qual o seu nome, por favor?"]));
});

test("resposta que AVANÇA não é repetição", () => {
  const ant = ["Rose, a churrasqueira Popular comporta 4 espetos tradicionais."];
  assert.ok(!ehRepeticaoDe("Rose, a Popular não permite o uso de lenha, só carvão.", ant));
  assert.ok(!ehRepeticaoDe("Te mandei a foto do modelo 😊", ant));
});

test("frase curta não é julgada — vocativo repete por natureza", () => {
  assert.ok(!ehRepeticaoDe("Prazer, Rose!", ["Prazer, Rose!"]));
  assert.ok(!ehRepeticaoDe("", ["qualquer coisa"]));
});

// ── Oferta obsoleta: já enviou, mas o texto ainda oferece ─────────────────────
// O roteador garante a ferramenta DEPOIS do turno, então o modelo escreveu o
// texto sem saber que o envio ia acontecer. Replay da Rochelly: o catálogo FOI
// enviado e a mensagem perguntava "prefere que eu envie o catálogo completo?" —
// a segunda vez seguida, e a conversa travou ali.

test("oferta do que já foi enviado neste turno é cortada", () => {
  // Caso real da Rochelly: pergunta de ESCOLHA ("A ou B?"), que o passo da
  // permissão preserva de propósito — só este passo a corta, e só porque o
  // envio já aconteceu.
  const r = polir("Rochelly, temos vários modelos na linha Prime. Você procura um modelo específico ou prefere que eu envie o catálogo completo?",
    [], [], "Rochelly", ["enviar_catalogo"]);
  assert.equal(r.texto, "Rochelly, temos vários modelos na linha Prime.");
  assert.ok(r.marcas.includes("oferta_obsoleta:catalogo"));
});

test("se a oferta era a mensagem INTEIRA, confirma o envio em vez de repeti-la", () => {
  // Aqui devolver o original significaria perguntar "prefere que eu envie o
  // catálogo?" depois de tê-lo enviado — pior que o tique.
  const r = polir("Rochelly, você procura algum modelo específico ou prefere que eu envie o catálogo completo para você dar uma olhada? 😊",
    [], [], "Rochelly", ["enviar_video", "enviar_catalogo"]);
  assert.equal(r.texto, "Rochelly, te mandei nosso catálogo 😊");
  assert.ok(r.marcas.includes("confirmou_envio"));
});

test("sem o envio no turno, a pergunta de ESCOLHA continua legítima", () => {
  // Esta pergunta é exigida pelo customPrompt enquanto o lead não escolheu.
  const p = "Rochelly, você procura algum modelo específico ou prefere que eu envie o catálogo completo? 😊";
  const r = polir(p, [], [], "Rochelly", ["enviar_video"]);
  assert.equal(r.texto, p);
  assert.equal(r.marcas.length, 0);
});

test("pergunta que só CITA o enviado não é oferta — fica", () => {
  const p = "Te mandei nosso catálogo 😊 Algum modelo chamou a sua atenção?";
  const r = polir(p, [], [], null, ["enviar_catalogo"]);
  assert.equal(r.texto, p);
});

test("a cauda do clichê é genérica, não uma lista de palavras", () => {
  // Cada rodada de replay trazia uma cauda nova ("para quando quiser
  // continuar", "até você decidir"). Enumerar caudas é corrida perdida — a
  // cauda passou a ser qualquer trecho CURTO depois da preposição, e o limite
  // de 30 caracteres é o que protege a frase de escopo, que é longa.
  for (const [t, nome] of [
    ["👍 Rose, fico à disposição para quando quiser continuar.", "Rose"],
    ["Tudo bem! Estou à disposição se precisar.", null],
    ["Fico por aqui até você decidir.", null],
  ] as [string, string | null][]) {
    assert.ok(polir(t, [], [], nome).marcas.includes("cliche"), `não pegou: ${t}`);
  }
  // A frase de ESCOPO tem cauda longa e continua fora do corte.
  const escopo = "Estou aqui para ajudar você com tudo sobre churrasqueiras, fogões campeiros e lareiras.";
  assert.equal(polir(escopo).texto, escopo);
});
