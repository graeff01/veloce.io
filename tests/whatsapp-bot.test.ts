import { test } from "node:test";
import assert from "node:assert/strict";
import { formatForWhatsApp } from "../lib/notifications/whatsapp-bot";

test("formatForWhatsApp: negrito <b> vira *", () => {
  assert.equal(formatForWhatsApp("<b>🔥 Lead quente</b>"), "*🔥 Lead quente*");
});

test("formatForWhatsApp: itálico <i> vira _", () => {
  assert.equal(formatForWhatsApp("veio de <i>Campanha Meta</i>"), "veio de _Campanha Meta_");
});

test("formatForWhatsApp: link <a> vira 'LABEL: URL'", () => {
  assert.equal(
    formatForWhatsApp('<a href="https://app/x">Abrir painel</a>'),
    "Abrir painel: https://app/x",
  );
});

test("formatForWhatsApp: link sem label (ou igual à URL) vira só a URL", () => {
  assert.equal(formatForWhatsApp('<a href="https://app/x"></a>'), "https://app/x");
  assert.equal(formatForWhatsApp('<a href="https://app/x">https://app/x</a>'), "https://app/x");
});

test("formatForWhatsApp: desescapa entidades e remove tags desconhecidas", () => {
  assert.equal(formatForWhatsApp("R$ 30 &lt; 40 &amp; ok"), "R$ 30 < 40 & ok");
  assert.equal(formatForWhatsApp("<span>oi</span>"), "oi");
});

test("formatForWhatsApp: mensagem real (cabeçalho + corpo + CTA)", () => {
  const html =
    '<b>🔥 Lead altamente qualificado</b>\n' +
    'João — <i>Campanha Meta — Renegade</i>\n\n' +
    '<a href="https://app/clients/1?tab=leads">Ver no painel</a>';
  const out = formatForWhatsApp(html);
  assert.equal(
    out,
    "*🔥 Lead altamente qualificado*\n" +
      "João — _Campanha Meta — Renegade_\n\n" +
      "Ver no painel: https://app/clients/1?tab=leads",
  );
  assert.ok(!out.includes("<"), "não deve sobrar HTML");
});
