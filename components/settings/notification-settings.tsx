"use client";

import { useEffect, useState } from "react";
import { Bell, Send, Loader2, Check, Zap } from "lucide-react";

interface Prefs {
  dailyDigest: boolean;
  criticalAlerts: boolean;
  leadMessages: boolean;
  pushEnabled: boolean;
  telegramEnabled: boolean;
  telegramLinked: boolean;
  telegramUsername: string | null;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/notifications/preferences").then((r) => (r.ok ? r.json() : null)).then(setPrefs).catch(() => {});
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => reg?.pushManager.getSubscription()).then((s) => setPushSubscribed(!!s)).catch(() => {});
    }
  }, []);

  async function savePref(patch: Partial<Prefs>) {
    setPrefs((p) => (p ? { ...p, ...patch } : p));
    await fetch("/api/notifications/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).catch(() => {});
  }

  async function enablePush() {
    setBusy("push");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) { alert("Este navegador não suporta notificações push."); return; }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { alert("Permissão negada. Habilite nas configurações do navegador."); return; }
      const { publicKey, available } = await fetch("/api/push/public-key").then((r) => r.json());
      if (!available || !publicKey) { alert("Push ainda não configurado no servidor (chaves VAPID)."); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys }) });
      setPushSubscribed(true);
      await savePref({ pushEnabled: true });
    } finally { setBusy(null); }
  }

  async function disablePush() {
    setBusy("push");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: "DELETE" });
        await sub.unsubscribe();
      }
      setPushSubscribed(false);
      await savePref({ pushEnabled: false });
    } finally { setBusy(null); }
  }

  async function connectTelegram() {
    setBusy("tg");
    try {
      const r = await fetch("/api/notifications/telegram-link").then((x) => x.json());
      if (!r.available) { alert("Telegram ainda não configurado no servidor (bot)."); return; }
      window.open(r.link, "_blank", "noopener,noreferrer");
    } finally { setBusy(null); }
  }

  async function sendTest() {
    setBusy("test");
    try {
      const r = await fetch("/api/notifications/test", { method: "POST" }).then((x) => x.json());
      const parts: string[] = [];
      parts.push(r.push ? "✅ Navegador" : "—  Navegador (ative acima)");
      parts.push(r.telegram ? "✅ Telegram" : "—  Telegram (conecte acima)");
      alert(`Teste enviado:\n${parts.join("\n")}`);
    } finally { setBusy(null); }
  }

  if (!prefs) return <div className="skeleton-surface" style={{ height: 180, borderRadius: 10 }} />;

  return (
    <div style={{ marginTop: 18, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-panel)", display: "flex", alignItems: "center", gap: 8 }}>
        <Bell size={15} style={{ color: "var(--accent)" }} />
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 650, color: "var(--text-primary)" }}>Notificações</h2>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Resumo do dia e alertas críticos — no navegador e no Telegram.</p>
        </div>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* O QUE receber */}
        <Toggle label="Nova mensagem de lead" hint="Aviso na hora que um lead manda mensagem no WhatsApp (no máx. 1 a cada 10 min por conversa)." checked={prefs.leadMessages} onChange={(v) => savePref({ leadMessages: v })} />
        <Toggle label="Resumo do dia" hint="Compromissos e pendências, toda manhã." checked={prefs.dailyDigest} onChange={(v) => savePref({ dailyDigest: v })} />
        <Toggle label="Alertas críticos" hint="Avisos urgentes do co-piloto (ex.: CPL disparou)." checked={prefs.criticalAlerts} onChange={(v) => savePref({ criticalAlerts: v })} />

        <div style={{ height: 1, background: "var(--border)" }} />

        {/* ONDE receber */}
        <Row
          label="Notificações no navegador"
          hint="Desktop e Android, mesmo com o app fechado."
          action={
            <button onClick={pushSubscribed ? disablePush : enablePush} disabled={busy === "push"} style={btn(pushSubscribed)}>
              {busy === "push" ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : pushSubscribed ? <Check size={12} /> : null}
              {pushSubscribed ? "Ativado" : "Ativar"}
            </button>
          }
        />
        <Row
          label="Telegram"
          hint={prefs.telegramLinked ? `Conectado${prefs.telegramUsername ? ` (@${prefs.telegramUsername})` : ""}.` : "Receba também no Telegram (à prova de falha)."}
          action={
            <button onClick={connectTelegram} disabled={busy === "tg"} style={btn(prefs.telegramLinked)}>
              {busy === "tg" ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : prefs.telegramLinked ? <Check size={12} /> : <Send size={12} />}
              {prefs.telegramLinked ? "Conectado" : "Conectar"}
            </button>
          }
        />

        <div style={{ height: 1, background: "var(--border)" }} />

        <Row
          label="Testar agora"
          hint="Envia uma notificação de teste para os canais ativos."
          action={
            <button onClick={sendTest} disabled={busy === "test"} style={btn(false)}>
              {busy === "test" ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Zap size={12} />}
              Enviar teste
            </button>
          }
        />
      </div>
    </div>
  );
}

function btn(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 8,
    border: `1px solid ${active ? "#16A34A" : "var(--border-strong)"}`,
    background: active ? "color-mix(in srgb, #16A34A 12%, transparent)" : "var(--bg-elevated)",
    color: active ? "#16A34A" : "var(--text-primary)", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  };
}

function Row({ label, hint, action }: { label: string; hint: string; action: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{label}</p>
        <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "2px 0 0" }}>{hint}</p>
      </div>
      {action}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{label}</p>
        <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "2px 0 0" }}>{hint}</p>
      </div>
      <button onClick={() => onChange(!checked)} role="switch" aria-checked={checked}
        style={{ width: 40, height: 23, borderRadius: 99, border: "none", cursor: "pointer", flexShrink: 0, position: "relative", background: checked ? "var(--accent)" : "var(--border-strong)", transition: "background 150ms" }}>
        <span style={{ position: "absolute", top: 2, left: checked ? 19 : 2, width: 19, height: 19, borderRadius: "50%", background: "#fff", transition: "left 150ms", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
      </button>
    </div>
  );
}
