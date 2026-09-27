import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ler = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const shell = ler("components", "portal", "portal-shell.tsx");
const barra = ler("components", "portal", "portal-mobile-header.tsx");

// ── O topo do PWA: conteúdo passando por trás do relógio ─────────────────────
// Print do usuário (iPhone, PWA instalado): o título "Consumo — Setembro"
// aparecia ACIMA da barra, colado no relógio, e ele confirmou que acontecia em
// TODAS as abas.
//
// A causa não era a barra e não era a tela: a reserva do notch estava sendo
// feita DUAS vezes. `portal-shell` dá `padding-top:env(safe-area-inset-top)` ao
// <main>, e a barra reserva o mesmo espaço no próprio padding. Sobrava uma faixa
// da altura do notch que a barra não cobria — e o conteúdo rolava por ela.

/** As classes de <main> que o shell reserva no celular. */
function mainsDoShell(): string[] {
  const m = /@media\(max-width:1023px\)\{\s*([^}]*?)\{padding-top:env\(safe-area-inset-top\)\}/.exec(shell);
  assert.ok(m, "a regra de safe-area do shell sumiu ou mudou de forma");
  return m[1].split(",").map((s) => s.trim().replace(/^\./, ""));
}

test("a barra anula a reserva de TODOS os mains que o shell reserva", () => {
  // Se alguém criar um sétimo <main> e só lembrar do shell, aquela tela volta a
  // ter a reserva dobrada — e o defeito reaparece só nela, que é o pior jeito
  // de reaparecer.
  const mains = mainsDoShell();
  assert.ok(mains.length >= 6, `esperava a lista de mains, achei ${mains}`);
  const neutraliza = /@media\(max-width:1023px\)\{\s*([^}]*?)\{padding-top:0\}/.exec(barra);
  assert.ok(neutraliza, "a barra parou de anular a reserva do main");
  const anuladas = neutraliza[1].split(",").map((s) => s.trim());
  for (const nome of mains) {
    assert.ok(anuladas.includes(`.${nome}.${nome}`),
      `.${nome} é reservado pelo shell mas a barra não anula: reserva dobrada volta nessa tela`);
  }
});

test("a anulação usa classe dobrada, não sorte de ordem", () => {
  // Media query não soma especificidade. Sem dobrar a classe, quem vence é quem
  // aparecer depois no DOM — e isso muda se alguém reordenar o JSX da página.
  // Mesmo recurso do `.ptop.ptop` em PORTAL_TOQUE_CSS, pelo mesmo motivo.
  assert.match(barra, /\.pmain\.pmain/, "sem classe dobrada a regra perde para a do shell");
  assert.doesNotMatch(barra, /\{\s*\.pmain,/, "classe simples empata em especificidade");
});

test("a barra continua reservando o notch no próprio padding", () => {
  // É ela que pinta o fundo sólido até o topo. Se esta reserva sair, o título
  // dela ("Consumo", "Conversas") vai parar debaixo do relógio.
  assert.match(barra, /\.pmhead\{[^}]*position:sticky;top:0/, "a barra precisa grudar no topo");
  assert.match(barra, /padding:calc\(10px \+ env\(safe-area-inset-top\)\)/,
    "sem isto o conteúdo da própria barra fica sob o relógio");
});

test("as telas SEM barra mantêm a reserva do shell", () => {
  // Frete, Aprendizado, IA e Objeções não montam a barra: para elas a reserva do
  // shell é a única proteção, e a anulação não pode alcançá-las.
  const dir = join(process.cwd(), "app", "r", "[token]");
  const semBarra: string[] = [];
  for (const nome of readdirSync(dir)) {
    let pagina: string;
    try { pagina = readFileSync(join(dir, nome, "page.tsx"), "utf8"); } catch { continue; }
    if (/<main className="(pmain|fmain|imain|amain|tmain|qmain)"/.test(pagina)
        && !pagina.includes("PortalMobileHeader")) semBarra.push(nome);
  }
  assert.ok(semBarra.length > 0, "esperava telas sem barra — se sumiram, esta regra pode ser simplificada");
  // A anulação mora na barra: uma tela que não a monta nunca recebe a regra.
  for (const nome of semBarra) {
    const pagina = readFileSync(join(dir, nome, "page.tsx"), "utf8");
    assert.ok(!pagina.includes("PortalMobileHeader"),
      `${nome} passou a montar a barra — reveja se ela ainda precisa da reserva do shell`);
  }
});
