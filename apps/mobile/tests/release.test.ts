// ── O que NÃO pode entrar num build de release ────────────────────────────────
// Estes testes existem porque as conveniências de desenvolvimento — formulário
// preenchido, apontar para um IP de rede local — são exatamente as coisas que,
// se vazarem para a App Store, viram um problema de segurança e uma reprovação.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveApiBase } from "../src/core/api-base";

// `import.meta.dirname` evita o atrito entre o tipo URL do DOM e o do Node.
const leia = (p: string) => readFileSync(join(import.meta.dirname, p), "utf8");

test("produção recusa HTTP, mesmo em host local", () => {
  assert.throws(() => resolveApiBase("http://192.168.0.10:3000", "production"), /HTTPS/i);
  assert.throws(() => resolveApiBase("http://localhost:3000", "production"), /HTTPS/i);
});

test("desenvolvimento recusa apontar para infraestrutura de produção", () => {
  for (const host of ["https://veloce.io", "https://algo.railway.app", "https://veloceio-production.up.railway.app"]) {
    assert.throws(() => resolveApiBase(host, "development"), /produção/i);
    assert.throws(() => resolveApiBase(host, "staging"), /produção/i);
  }
});

test("nenhuma URL de produção embutida no código do app", () => {
  for (const arquivo of ["../src/config/env.ts", "../src/core/api-base.ts", "../src/config/legal.ts"]) {
    const texto = leia(arquivo);
    // A lista de marcadores PODE citar os hosts (é a trava); o que não pode é
    // uma URL montada, pronta para uso.
    assert.ok(!/https:\/\/[a-z0-9-]*veloce[a-z0-9-]*\.(io|app)/i.test(texto), `${arquivo} traz URL de produção`);
  }
});

test("preenchimento de desenvolvimento é inerte fora de __DEV__", () => {
  const texto = leia("../src/config/dev-prefill.ts");
  assert.match(texto, /if \(!__DEV__\) return VAZIO;/, "o atalho precisa morrer no release");
  // E as variáveis só podem ser lidas DEPOIS dessa guarda.
  const guarda = texto.indexOf("if (!__DEV__)");
  const primeiraLeitura = texto.indexOf("process.env.EXPO_PUBLIC_DEV");
  assert.ok(guarda >= 0 && primeiraLeitura > guarda, "as variáveis de dev são lidas antes da guarda");
});

test("o app declara segredo nenhum no app.json", () => {
  const app = JSON.parse(leia("../app.json")) as { expo: { extra?: Record<string, unknown>; ios: Record<string, unknown> } };
  const extra = JSON.stringify(app.expo.extra ?? {});
  assert.ok(!/https?:\/\//.test(extra), "extra não pode carregar URL");
  assert.equal(app.expo.extra?.appEnv, "development", "o padrão é development; release vem do perfil do EAS");
  const ats = (app.expo.ios.infoPlist as Record<string, Record<string, boolean> | undefined>).NSAppTransportSecurity;
  assert.ok(ats, "ATS precisa estar declarado");
  assert.equal(ats.NSAllowsArbitraryLoads, false, "ATS não pode liberar tráfego sem TLS");
});

test("o WebView de áudio não navega para fora do documento embutido", () => {
  const texto = leia("../src/ui/audio-opus.tsx");
  assert.match(texto, /onShouldStartLoadWithRequest=\{\(r\) =>/, "precisa filtrar navegação");
  assert.ok(!/originWhitelist=\{\["\*"\]\}/.test(texto), "originWhitelist não pode ser aberta");
  assert.ok(!/allowFileAccess\b/.test(texto), "não deve pedir acesso a arquivo");
});

test("o token do painel fica no Keychain, nunca em armazenamento claro", () => {
  const loja = readFileSync(join(import.meta.dirname, "../src/storage/session-store.ts"), "utf8");
  assert.match(loja, /portalTokenStore/, "a guarda do token do painel precisa existir");
  // Procura o IMPORT, não a palavra: o arquivo cita AsyncStorage no comentário
  // que explica justamente por que ele não serve aqui.
  assert.ok(!/from ["']@react-native-async-storage/.test(loja), "nada de AsyncStorage nesta camada");
  // Toda leitura e escrita passa pelo SecureStore com a mesma opção de proteção.
  assert.match(loja, /KEY_PORTAL[\s\S]*?SecureStore/, "o token do painel usa SecureStore");
});

test("nenhuma aba usa título grande — a regra vive só na pilha", () => {
  const pilha = readFileSync(join(import.meta.dirname, "../src/ui/pilha.tsx"), "utf8");
  assert.match(pilha, /headerLargeTitle:\s*false/, "a pilha define a regra");

  // Nenhuma tela pode reintroduzir o título grande por conta própria.
  for (const tela of [
    "../app/(app)/conversas/index.tsx", "../app/(app)/revisao/index.tsx",
    "../app/mais.tsx", "../app/(app)/anuncios/index.tsx",
    "../src/ui/lista-conversas.tsx",
  ]) {
    const texto = readFileSync(join(import.meta.dirname, tela), "utf8");
    assert.ok(!/headerLargeTitle:\s*true/.test(texto), `${tela} reintroduz o título grande`);
  }
});

// ── Regra 5.1.1(v) da Apple ───────────────────────────────────────────────────
// "Apps que permitem CRIAR conta precisam permitir EXCLUIR a conta pelo app."
//
// Aqui quem administra o acesso das vendedoras é o dono do painel, não elas — um
// botão de excluir a própria conta não é o que o produto quer. A saída foi tirar
// a CRIAÇÃO do app: ela vive no portal web, e a regra deixa de se aplicar.
//
// Este teste existe para a criação não voltar sem querer numa tela futura e
// derrubar a submissão meses depois, quando ninguém lembrar do porquê.

test("o app não cria conta em lugar nenhum", () => {
  const fontes = [
    "../app/vincular.tsx",
    "../src/ui/session.tsx",
    "../src/core/client.ts",
  ];
  for (const f of fontes) {
    const src = leia(f);
    assert.ok(!src.includes("auth/register"), `${f} chama a rota de registro`);
    assert.ok(!/vincularECriar|Criar conta e entrar/.test(src), `${f} ainda oferece criar conta`);
  }
});
