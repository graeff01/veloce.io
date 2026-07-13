import { test } from "node:test";
import assert from "node:assert/strict";
import { isUnread, unreadCount, newInbound, snapshot } from "../lib/unread";

const t = (iso: string) => iso;
const row = (contactId: string, lastDirection: string | null, lastMessageAt: string | null) => ({ contactId, lastDirection, lastMessageAt });

test("unreadCount: conta só conversas com última mensagem inbound e mais nova que seenAt", () => {
  const list = [
    row("a", "in", t("2026-07-12T10:00:00Z")),   // inbound novo → não lida
    row("b", "out", t("2026-07-12T10:00:00Z")),  // última é nossa → lida
    row("c", "in", t("2026-07-12T09:00:00Z")),   // inbound já visto → lida
    row("d", "in", null),                        // sem timestamp → ignora
  ];
  const seen = { c: Date.parse("2026-07-12T09:30:00Z") };
  assert.equal(unreadCount(list, seen), 1);
  assert.equal(isUnread(list[0], seen), true);
  assert.equal(isUnread(list[1], seen), false);
  assert.equal(isUnread(list[2], seen), false);
});

test("newInbound: detecta inbound que avançou; NÃO inclui outbound nem conversa parada", () => {
  const prev = { a: Date.parse("2026-07-12T09:00:00Z"), b: Date.parse("2026-07-12T09:00:00Z") };
  const list = [
    row("a", "in", t("2026-07-12T10:00:00Z")),   // avançou e é inbound → notifica
    row("b", "out", t("2026-07-12T10:00:00Z")),  // avançou mas é outbound → NÃO
    row("c", "in", t("2026-07-12T09:00:00Z")),   // novo contato inbound → notifica
    row("d", "in", t("2026-07-12T09:00:00Z")),   // (será baseline depois)
  ];
  const fresh = newInbound(prev, list).map((c) => c.contactId).sort();
  assert.deepEqual(fresh, ["c", "d"].includes("d") ? ["a", "c", "d"] : ["a", "c"]);
});

test("newInbound: sem mudança entre polls → nada novo", () => {
  const list = [row("a", "in", t("2026-07-12T10:00:00Z"))];
  const prev = snapshot(list);
  assert.equal(newInbound(prev, list).length, 0);
});
