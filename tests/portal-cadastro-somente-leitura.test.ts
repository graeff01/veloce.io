import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ── Cadastro não se altera pelo portal ─────────────────────────────────────────
// Cadastro é o que a IA usa pra responder: prompt, conhecimento, preço, catálogo.
// Quem altera isso é quem tem acesso ao código. O portal LÊ.
//
// Antes desta trava, a tela de frete gravava direto em PricingConfig.rules.freight —
// a mesma tabela que a IA consulta pra cotar. Quem tivesse a seção "frete" mudava o
// preço que o cliente recebe no atendimento seguinte, sem revisão de ninguém.
//
// Este teste é uma varredura de FONTE, não de comportamento: pega uma rota nova que
// nasça escrevendo, que é justamente como a brecha voltaria.

const RAIZ = join(import.meta.dirname, "..");
const PORTAL = join(RAIZ, "app/api/portal");

const TABELAS_DE_CADASTRO = ["aiAgentConfig", "knowledgeChunk", "pricingConfig", "catalogItem"];
const ESCRITAS = ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"];

function arquivosTs(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) out.push(...arquivosTs(caminho));
    else if (nome.endsWith(".ts") || nome.endsWith(".tsx")) out.push(caminho);
  }
  return out;
}

test("nenhuma rota do portal escreve em tabela de cadastro", () => {
  const ofensas: string[] = [];
  for (const arquivo of arquivosTs(PORTAL)) {
    const fonte = readFileSync(arquivo, "utf8");
    for (const tabela of TABELAS_DE_CADASTRO) {
      for (const op of ESCRITAS) {
        if (fonte.includes(`prisma.${tabela}.${op}(`) || fonte.includes(`prismaUnscoped.${tabela}.${op}(`)) {
          ofensas.push(`${arquivo.replace(RAIZ + "/", "")} → ${tabela}.${op}`);
        }
      }
    }
  }
  assert.deepEqual(ofensas, [], `o portal voltou a escrever em cadastro:\n  ${ofensas.join("\n  ")}`);
});

test("o PUT de frete recusa e registra a tentativa", () => {
  const fonte = readFileSync(join(PORTAL, "[token]/freight/route.ts"), "utf8");
  assert.ok(fonte.includes("export async function PUT"), "o PUT sumiu — deve existir e recusar, não dar 404");
  assert.ok(fonte.includes("status: 403"), "o PUT precisa responder 403");
  assert.ok(fonte.includes("freight.update.blocked"), "a tentativa precisa ir pra auditoria");
  assert.ok(!fonte.includes("pricingConfig.update"), "o PUT não pode mais gravar");
});

test("a tela de frete está em somente leitura", () => {
  const fonte = readFileSync(join(RAIZ, "components/portal/portal-frete.tsx"), "utf8");
  assert.ok(/const SOMENTE_LEITURA = true;/.test(fonte), "a trava da tela foi desligada");
});
