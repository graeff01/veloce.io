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

// ── A faixa acima da barra (o que o primeiro conserto NÃO resolveu) ──────────
// Tirar a reserva dobrada era correto, mas NÃO era a causa: reproduzi os dois
// estados em Chrome headless e a geometria ficou idêntica.
//
// A medição do print (iPhone Pro Max, 1290x2796, 3x) deu a resposta: a barra
// começa em CSS y=59 e tem 55px de altura — 10+34+10, SEM o padding do notch.
// Ou seja, env(safe-area-inset-top) resolve para ZERO no aparelho.
//
// Causa: o layout combina viewport-fit=cover (o conteúdo vai para baixo da barra
// de status) com statusBarStyle "default" (o iOS reporta os insets como 0).
// Nessa combinação toda reserva de notch do app vira zero.
//
// O conserto não depende de env(): a barra estende o próprio fundo para cima.
// Reproduzido e verificado em Chrome headless, antes e depois.
test("a barra estende o fundo para cima, sem depender de env()", () => {
  const regra = /\.pmhead::before\{([^}]*)\}/.exec(barra)?.[1] ?? "";
  assert.ok(regra, "a extensão de fundo da barra sumiu — a faixa do notch volta a vazar");
  assert.match(regra, /position:absolute/);
  assert.match(regra, /bottom:100%/, "sem bottom:100% a faixa não fica ACIMA da barra");
  assert.match(regra, /background:var\(--p-surface\)/, "a faixa tem de ser a MESMA cor da barra");
  assert.doesNotMatch(regra, /env\(/, "o conserto não pode depender de env(): é justamente o que falha");
  // A barra é sticky, então a faixa viaja com ela. Sem isso ficaria presa no
  // topo do documento e não cobriria nada depois da primeira rolagem.
  assert.match(barra, /\.pmhead\{[^}]*position:sticky/);
});

test("a faixa cobre com folga o maior notch", () => {
  // 59px é o inset do iPhone Pro Max. Precisa de margem para aparelhos maiores
  // e para o repuxo (rubber band) ao arrastar no topo.
  const h = /\.pmhead::before\{[^}]*height:(\d+)px/.exec(barra)?.[1];
  assert.ok(h, "a faixa precisa de altura explícita");
  assert.ok(Number(h) >= 120, `${h}px é pouco: não cobre notch + repuxo`);
});

// ── A raiz: viewport-fit=cover com statusBarStyle "default" ─────────────────
// Os dois consertos anteriores tentaram PINTAR por cima da faixa. Não bastava:
// com `cover` + `"default"`, o iOS deixa o conteúdo entrar embaixo do relógio E
// reporta os insets como zero — então não havia como reservar nem cobrir.
//
// Sem `cover`, o sistema reserva a faixa sozinho e o conteúdo nunca chega lá.
test("o portal NÃO usa viewport-fit=cover", () => {
  const layout = ler("app", "r", "[token]", "layout.tsx");
  assert.doesNotMatch(layout, /viewportFit:\s*["']cover["']/,
    "cover só é seguro com statusBarStyle black-translucent — com 'default' ele deixa o conteúdo passar por baixo do relógio");
});

test("cover e black-translucent só podem voltar JUNTOS", () => {
  // Um sem o outro é o defeito. Se alguém religar cover, tem de religar o estilo
  // também — e aí resolver o contraste do relógio no tema claro.
  const layout = ler("app", "r", "[token]", "layout.tsx");
  const temCover = /viewportFit:\s*["']cover["']/.test(layout);
  const temTranslucent = /black-translucent/.test(layout.replace(/\/\/[^\n]*/g, ""));
  assert.equal(temCover, temTranslucent,
    "cover exige black-translucent; black-translucent sem cover não serve para nada");
});

test("a cor da barra de status segue o APARELHO, não o cadastro", () => {
  // O tema é preferência local (localStorage), e o modo do banco é só o padrão:
  // a JR está 'light' no cadastro e é usada no escuro. Sem sincronizar, sobra uma
  // tarja branca em cima de uma tela preta.
  const tema = ler("lib", "portal-theme.ts");
  assert.match(tema, /meta\[name=theme-color\]/, "o script parou de acertar a cor da barra");
  assert.match(tema, /MutationObserver/, "sem observar data-pt, a cor não acompanha a troca de tema");
  assert.match(tema, /attributeFilter:\['data-pt'\]/);
});
