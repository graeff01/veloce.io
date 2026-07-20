import { test } from "node:test";
import assert from "node:assert/strict";
import { isUnread, unreadCount, newInbound } from "../lib/unread";
import { isTakenOver } from "../lib/takeover";

const row = (contactId: string, lastDirection: string | null, lastMessageAt: string | null) => ({ contactId, lastDirection, lastMessageAt });

test("unreadCount: só inbound mais novo que seenAt", () => {
  const list = [row("a", "in", "2026-07-12T10:00:00Z"), row("b", "out", "2026-07-12T10:00:00Z"), row("c", "in", "2026-07-12T09:00:00Z")];
  assert.equal(unreadCount(list, { c: Date.parse("2026-07-12T09:30:00Z") }), 1);
  assert.equal(isUnread(list[1], {}), false);
});
test("newInbound: detecta inbound que avançou; ignora outbound", () => {
  const prev = { a: Date.parse("2026-07-12T09:00:00Z"), b: Date.parse("2026-07-12T09:00:00Z") };
  const list = [row("a", "in", "2026-07-12T10:00:00Z"), row("b", "out", "2026-07-12T10:00:00Z")];
  assert.deepEqual(newInbound(prev, list).map((c) => c.contactId), ["a"]);
});
const NOW = Date.parse("2026-07-12T12:00:00Z");
test("isTakenOver: ativo na janela, expira depois, null nunca", () => {
  assert.equal(isTakenOver(new Date(NOW - 60 * 60000), 180, NOW), true);
  assert.equal(isTakenOver(new Date(NOW - 180 * 60000), 180, NOW), false);
  assert.equal(isTakenOver(null, 180, NOW), false);
});
