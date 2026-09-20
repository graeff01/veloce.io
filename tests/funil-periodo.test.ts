import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(import.meta.dirname, "..");
const ler = (p: string) => readFileSync(join(RAIZ, p), "utf8");

// ── O funil era fixo: mostrava o histórico inteiro, sempre ──────────────────
// Não era só o seletor faltando na tela — getClientFunnel buscava waConversation
// SEM nenhum filtro de data. Reportado pelo cliente.

test("getClientFunnel aceita período e filtra pela ENTRADA do lead", () => {
  const f = ler("lib/notifications/client-funnel.ts");
  assert.match(f, /export async function getClientFunnel\([^)]*period/, "a função não aceita período");
  // Pela entrada, não pela última mensagem: é o que dá leitura de coorte
  // ("dos leads que chegaram em setembro, onde pararam").
  assert.match(f, /firstInboundAt:\s*\{\s*gte/, "não filtra por firstInboundAt");
  assert.doesNotMatch(f, /lastMessageAt:\s*\{\s*gte:\s*janela/, "filtrar por lastMessageAt quebra a leitura de coorte");
});

test('"tudo" não filtra nada — é o padrão e preserva o número que o cliente conhece', () => {
  const f = ler("lib/notifications/client-funnel.ts");
  assert.match(f, /period\s*&&\s*period\s*!==\s*"tudo"/, 'o "tudo" deixou de ser a saída sem filtro');
  const pg = ler("app/r/[token]/funil/page.tsx");
  assert.match(pg, /p\s*&&\s*p\s*!==\s*"tudo"\s*\?\s*normalizePeriod\(p\)\s*:\s*"tudo"/, "a página não usa tudo como padrão");
});

test("a página passa o período adiante e mostra o seletor", () => {
  const pg = ler("app/r/[token]/funil/page.tsx");
  assert.match(pg, /getClientFunnel\(portal\.clientId,\s*conexao\s*\?\?\s*null,\s*periodo\)/);
  assert.match(pg, /meses=\{meses\}/);
});

test('o seletor só oferece "Todo o período" quando pedido', () => {
  const sel = ler("components/portal/portal-period.tsx");
  assert.match(sel, /incluirTudo\s*&&\s*<option value="tudo">/);
  // Painel, Anúncios e IA NÃO devem ganhar a opção: lá o período sempre existiu
  // e "tudo" mudaria o sentido dos comparativos (+12% vs. anterior).
  for (const p of ["app/r/[token]/page.tsx", "app/r/[token]/anuncios/page.tsx", "app/r/[token]/ia/page.tsx"]) {
    assert.doesNotMatch(ler(p), /incluirTudo/, `${p} não deveria oferecer "todo o período"`);
  }
});

test("o recorte aparece na tela, não só no dropdown", () => {
  // Quem imprime ou manda print precisa saber a que período o número se refere.
  assert.match(ler("components/portal/portal-funnel.tsx"), /rotuloPeriodo/);
});
