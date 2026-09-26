import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { modulosPortal, ferramentasDoPortal } from "@/lib/portal/modulos";

// ── Barra inferior do PWA no celular ──────────────────────────────────────────
// Os MESMOS casos do teste do aplicativo (apps/mobile/tests/inbox.test.ts). Se as
// duas barras discordarem sobre o que a vendedora enxerga, ela encontra um app e
// um site diferentes — e passa a desconfiar dos dois.

const chaves = (s: string[] | null, q = true) => modulosPortal(s, q).map((m) => m.chave);

test("lista VAZIA é configuração ausente, não proibição", () => {
  // A JR ficou sem barra no celular e a Boqueirão não. A diferença era esta: uma
  // tinha `sections` configurado, a outra nulo. Lista vazia caía no mesmo buraco
  // e apagava a navegação inteira — sem erro, sem aviso.
  assert.deepEqual(chaves([]), ["conversas", "anuncios", "funil", "revisao"]);
  assert.deepEqual(chaves(null), chaves([]), "nulo e vazio significam a mesma coisa");
});

test("uma seção de verdade continua limitando", () => {
  assert.deepEqual(chaves(["conversas"]), ["conversas"]);
  assert.deepEqual(chaves(["conversas", "funil"]), ["conversas", "funil"]);
});

test("sections nulo = cliente sem configuração = tudo", () => {
  assert.deepEqual(chaves(null), ["conversas", "anuncios", "funil", "revisao"]);
});

test("a ordem vem do produto, não da ordem que o servidor devolveu", () => {
  assert.deepEqual(
    chaves(["anuncios", "revisao", "funil", "conversas"]),
    ["conversas", "anuncios", "funil", "revisao"],
  );
});

test("no máximo quatro destinos — o excedente vive dentro do módulo", () => {
  const todas = ["painel", "revisao", "fechamento", "conversas", "aprendizado", "consumo",
    "frete", "equipe", "anuncios", "ia", "funil", "objecoes"];
  assert.equal(modulosPortal(todas, true).length, 4);
  // Com o produto inteiro ligado, Equipe fica de fora: os quatro de cima já
  // ocupam a barra e acompanhar segue sendo trabalho de mesa.
  assert.deepEqual(chaves(todas), ["conversas", "anuncios", "funil", "revisao"]);
});

test("cliente de poucas seções leva Equipe na barra", () => {
  // A Jardim do Lago: WhatsApp, Funil e acompanhamento. Acompanhar é o trabalho
  // INTEIRO das gerentes — empurrar isso para "só no portal web" deixaria as
  // duas sem chegar, no celular, exatamente naquilo que mais usam.
  assert.deepEqual(chaves(["conversas", "funil", "equipe"]), ["conversas", "funil", "equipe"]);
  assert.deepEqual(chaves(["conversas", "equipe"]), ["conversas", "equipe"]);
});

test("orçamento desligado no cliente derruba a aba, mas o fechamento a segura", () => {
  assert.deepEqual(chaves(["conversas", "revisao"], false), ["conversas"]);
  assert.deepEqual(chaves(["conversas", "revisao", "fechamento"], false), ["conversas", "revisao"]);
});

test("quem tem só fechamento ainda alcança a tela onde ele mora", () => {
  assert.deepEqual(chaves(["conversas", "fechamento"], false), ["conversas", "revisao"]);
});

test("o caminho de cada módulo é o do portal", () => {
  const m = modulosPortal(null, true);
  assert.deepEqual(m.map((x) => x.caminho), ["/conversas", "/anuncios", "/funil", "/revisao"]);
  assert.deepEqual(modulosPortal(["conversas", "equipe"], false).map((x) => x.caminho), ["/conversas", "/equipe"]);
});

test('"Mais" não anuncia como trabalho de mesa o que a barra já leva', () => {
  // Dizer "no portal web" sobre algo que está a um toque dali, na mesma tela,
  // é simplesmente falso — e faz o produto parecer desorganizado.
  const secoes = ["conversas", "funil", "equipe"];
  const naBarra = modulosPortal(secoes, false).map((m) => m.chave);
  assert.ok(!ferramentasDoPortal(secoes, naBarra).some((f) => f.chave === "equipe"));
  // Sem a barra levá-la, ela continua sendo listada — sumir em silêncio é pior.
  assert.ok(ferramentasDoPortal(secoes).some((f) => f.chave === "equipe"));
});

// ── Consumo no celular ───────────────────────────────────────────────────────
// Pedido do usuário: no telefone faltava a tela de acompanhamento de leads que
// existe na web. A causa não era layout — era classificação: Consumo estava na
// lista de "trabalho de mesa" e a folha "Mais" a mostrava como texto morto
// ("no portal web"). Acompanhar quantos atendimentos o plano já consumiu é um
// número que se olha de relance, não trabalho de mesa.
//
// Ela segue FORA da barra de baixo (não se usa o dia inteiro, e a barra tem teto
// de 4). O que mudou é ter `caminho`, que faz a folha levar até lá.
test("Consumo tem tela no celular e a folha leva até ela", () => {
  const f = ferramentasDoPortal(null).find((x) => x.chave === "consumo");
  assert.ok(f, "Consumo saiu da folha Mais");
  assert.equal(f!.caminho, "/consumo", "sem caminho, a folha volta a dizer 'no portal web'");
});

test("Consumo NÃO entra na barra de baixo", () => {
  // A barra lista módulos do dia a dia; com teto de 4, Consumo empurraria para
  // fora algo que a vendedora usa toda hora.
  //
  // O TIPO já garante o mais forte: "consumo" não pertence a `ModuloPortal`, e o
  // typecheck recusa até comparar as duas coisas. Aqui fica o que o tipo não
  // pega — o caminho não pode aparecer na barra por outra porta.
  assert.ok(!modulosPortal(null, true).some((m) => m.caminho === "/consumo"));
});

test("as ferramentas sem tela continuam sem caminho", () => {
  // Se um dia alguém der `caminho` a uma delas sem construir a tela, a folha
  // passa a levar para uma página que não existe no celular.
  const semTela = ["painel", "ia", "aprendizado", "objecoes", "frete"];
  for (const chave of semTela) {
    const f = ferramentasDoPortal(null).find((x) => x.chave === chave);
    assert.ok(f, `${chave} saiu da folha`);
    assert.equal(f!.caminho, undefined, `${chave} ganhou caminho sem ter tela de celular`);
  }
});

test("a página de Consumo monta cabeçalho e barra do celular", () => {
  // Ela nasceu só para o computador. Sem esses dois, quem abrisse no telefone
  // ficava numa tela sem título e sem como voltar.
  const pagina = readFileSync(join(process.cwd(), "app", "r", "[token]", "consumo", "page.tsx"), "utf8");
  assert.match(pagina, /<PortalMobileHeader[^>]*titulo="Consumo"/, "sem cabeçalho não há botão de voltar/Mais");
  assert.match(pagina, /<PortalMobileNav[^>]*active=\{null\}/, "a barra precisa aparecer, sem módulo aceso");
});
