import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { messageText } from "../lib/whatsapp";

const rota = readFileSync(join(process.cwd(), "app", "api", "whatsapp", "webhook", "route.ts"), "utf8");

// Os payloads abaixo são REAIS: saíram da coluna `raw` das mensagens da JR.
// 72 edições e 88 exclusões em sete semanas — não é caso de laboratório.

const EDICAO = {
  id: "wamid.HBgMNTU0MTg4OTY4NjY1FQIAEhgUM0E4QThERUFEOUIzNUFCOTJDRDcA",
  type: "edit",
  from: "554188968665",
  timestamp: "1784734435",
  edit: {
    message: { text: { body: "Tem mais Fotos desse modelo pra me passar por favor?" }, type: "text" },
    original_message_id: "wamid.HBgMNTU0MTg4OTY4NjY1FQIAEhgUM0E0RjkzRDZCOUZERDRDMTA0MTkA",
  },
};

const EXCLUSAO = {
  id: "wamid.HBgMNTU1MTk0MTM2NjE1FQIAEhggQUNDQzdFRjFDQzZGNzBCRTg5MUMwOTAxOTBCRTZDREEA",
  type: "revoke",
  from: "555194136615",
  timestamp: "1784672252",
  revoke: { original_message_id: "wamid.HBgMNTU1MTk0MTM2NjE1FQIAEhggQUMxMDhCMzBDRTUzMTkxMTZFRjY3RjQxQzkzM0NDRTYA" },
};

test("o texto corrigido vem no evento — e é o que importa", () => {
  // Antes isto era jogado fora e virava "[O lead enviou um(a) edit]", enquanto o
  // texto ANTIGO seguia no histórico. A IA respondia à versão que a pessoa já
  // tinha corrigido.
  assert.equal(EDICAO.edit.message.text.body, "Tem mais Fotos desse modelo pra me passar por favor?");
  assert.ok(EDICAO.edit.original_message_id, "a Meta diz QUAL mensagem foi corrigida");
});

test("edição aplica o texto novo na mensagem original", () => {
  const bloco = rota.slice(rota.indexOf('if (m.type === "edit")'), rota.indexOf('if (m.type === "revoke")'));
  assert.match(bloco, /ed\?\.message\?\.text\?\.body/, "lê o texto novo do evento");
  assert.match(bloco, /waMessageId: ed\.original_message_id/, "escreve na mensagem original");
  assert.match(bloco, /data: \{ text: novoTexto \}/);
  assert.match(bloco, /continue;/, "não cria uma linha nova de lixo no histórico");
});

test("exclusão troca o conteúdo por um aviso, sem apagar a linha", () => {
  const bloco = rota.slice(rota.indexOf('if (m.type === "revoke")'), rota.indexOf("const contact = await prisma.waContact.upsert"));
  assert.match(bloco, /waMessageId: rv\.original_message_id/);
  assert.match(bloco, /text: "\[mensagem apagada pelo lead\]"/);
  assert.ok(!/delete/i.test(bloco), "auditoria: a linha continua existindo");
  assert.ok(EXCLUSAO.revoke.original_message_id, "a Meta diz QUAL mensagem foi apagada");
});

test("os dois são tratados antes de virar mensagem", () => {
  // Se caírem depois da criação, viram linha de lixo no histórico — que é
  // exatamente o que acontecia.
  const iEdit = rota.indexOf('if (m.type === "edit")');
  const iRevoke = rota.indexOf('if (m.type === "revoke")');
  const iCria = rota.indexOf("prisma.waMessage.create");
  assert.ok(iEdit > 0 && iEdit < iCria);
  assert.ok(iRevoke > 0 && iRevoke < iCria);
});

test("mensagem indisponível diz o que de fato houve", () => {
  // 118 casos: a Cloud API devolve o erro 131060 e o conteúdo nunca chega.
  // "não suportada" fazia parecer defeito nosso; o problema é a entrega.
  const t = messageText({ type: "unsupported" } as Parameters<typeof messageText>[0]);
  assert.match(t ?? "", /indispon[ií]vel/i);
  assert.match(t ?? "", /não entregou/i);
});

test("os marcadores de mídia continuam intactos", () => {
  // Rede de segurança: mexi no switch; o resto não podia mudar.
  const img = messageText({ type: "image" } as Parameters<typeof messageText>[0]);
  const aud = messageText({ type: "audio" } as Parameters<typeof messageText>[0]);
  assert.equal(img, "[O lead enviou uma imagem]");
  assert.equal(aud, "[O lead enviou um áudio]");
});
