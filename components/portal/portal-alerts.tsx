"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Flame, ShieldCheck, X, Bell } from "lucide-react";

// Alerta GLOBAL do portal (renderizado pelo shell → vale em qualquer página). Quando cai
// um orçamento pra revisar ou um lead pra fechar, o vendedor VÊ e OUVE mesmo estando em
// outra aba: popup no canto + som repetido (insiste, como o WhatsApp) + notificação do SO
// + título da aba piscando. Layer A (portal aberto); o Web Push cobre o portal fechado.

interface Alert { id: string; kind: "revisao" | "fechamento"; title: string; body: string; url: string }

// base64url (chave VAPID pública) → Uint8Array, como o pushManager.subscribe exige.
function vapidKeyToBytes(b64url: string): Uint8Array {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

const CFG = {
  revisao: { poll: "/quote-reviews", countKey: "pending", href: "/revisao", title: "Novo orçamento pra revisar", icon: ShieldCheck },
  fechamento: { poll: "/hot-leads", countKey: "unclaimed", href: "/fechamento", title: "Novo lead quer fechar", icon: Flame },
} as const;

export function PortalAlerts({ token, sections }: { token: string; sections?: string[] | null }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [needPerm, setNeedPerm] = useState(false);
  const prev = useRef<Record<string, number>>({});      // última contagem por tipo (-1 = ainda não carregou)
  const audio = useRef<AudioContext | null>(null);
  const ringTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringsLeft = useRef(0);
  const titleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const baseTitle = useRef<string>("");

  const enabled = useCallback((k: string) => !sections || sections.includes(k), [sections]);
  const anyQueue = enabled("revisao") || enabled("fechamento"); // cliente tem alguma fila? (senão, nada de alerta)

  // Destrava o áudio no 1º gesto do usuário (política de autoplay dos navegadores).
  useEffect(() => {
    const unlock = () => {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!audio.current) audio.current = new AC();
        if (audio.current.state === "suspended") audio.current.resume();
      } catch { /* ignore */ }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);

  useEffect(() => { if (anyQueue && typeof Notification !== "undefined") setNeedPerm(Notification.permission === "default"); }, [anyQueue]);

  // Web Push (Camada B): registra o service worker e inscreve o dispositivo do vendedor →
  // alerta chega mesmo com o portal FECHADO. Idempotente; só quando a permissão foi dada.
  const ensurePushSubscribed = useCallback(async () => {
    try {
      if (!anyQueue) return; // cliente sem fila não precisa de push
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const kr = await fetch(`/api/portal/${token}/push/public-key`, { cache: "no-store" });
        const kd = await kr.json().catch(() => null);
        if (!kd?.publicKey) return;
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyToBytes(kd.publicKey) as BufferSource });
      }
      const j = sub.toJSON();
      await fetch(`/api/portal/${token}/push/subscribe`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: j.keys?.p256dh, auth: j.keys?.auth } }),
      });
    } catch { /* best-effort */ }
  }, [token, anyQueue]);

  useEffect(() => { ensurePushSubscribed(); }, [ensurePushSubscribed]);

  function tone() {
    const ctx = audio.current;
    if (!ctx) return;
    try {
      // dois toques curtos (bi-blip) — chama atenção sem ser estridente
      [0, 0.18].forEach((t, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = "sine"; o.frequency.value = i === 0 ? 880 : 1050;
        const start = ctx.currentTime + t;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
        o.start(start); o.stop(start + 0.16);
      });
    } catch { /* ignore */ }
  }

  const stopRing = useCallback(() => {
    if (ringTimer.current) { clearInterval(ringTimer.current); ringTimer.current = null; }
    ringsLeft.current = 0;
    if (titleTimer.current) { clearInterval(titleTimer.current); titleTimer.current = null; if (baseTitle.current) document.title = baseTitle.current; }
  }, []);

  // Toca insistente (a cada 2,5s, até ~6 vezes ou até o vendedor interagir/focar).
  const startRing = useCallback((count: number) => {
    tone();
    ringsLeft.current = 6;
    if (ringTimer.current) clearInterval(ringTimer.current);
    ringTimer.current = setInterval(() => {
      if (ringsLeft.current-- <= 0 || document.visibilityState === "visible") { stopRing(); return; }
      tone();
    }, 2500);
    // título piscando (quando está em outra aba)
    if (!baseTitle.current) baseTitle.current = document.title;
    if (titleTimer.current) clearInterval(titleTimer.current);
    let on = false;
    titleTimer.current = setInterval(() => {
      if (document.visibilityState === "visible") { document.title = baseTitle.current; return; }
      document.title = on ? baseTitle.current : `🔴 (${count}) Novo!`;
      on = !on;
    }, 1000);
  }, [stopRing]);

  const fire = useCallback((kind: "revisao" | "fechamento", n: number) => {
    const c = CFG[kind];
    const body = kind === "revisao"
      ? `${n} orçamento(s) aguardando seu aval para ir ao cliente.`
      : `${n} lead(s) aprovaram o orçamento e querem fechar.`;
    const a: Alert = { id: `${kind}-${Date.now()}`, kind, title: c.title, body, url: `/r/${token}${c.href}` };
    setAlerts((list) => [a, ...list].slice(0, 4));
    startRing(n);
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try { new Notification(`${kind === "revisao" ? "📋" : "🔥"} ${c.title}`, { body, tag: kind }); } catch { /* ignore */ }
    }
  }, [token, startRing]);

  // Poll dos dois tipos; dispara quando a contagem SOBE (item novo).
  useEffect(() => {
    let alive = true;
    const kinds = (Object.keys(CFG) as (keyof typeof CFG)[]).filter((k) => enabled(k));
    if (!kinds.length) return;
    const tick = async () => {
      for (const k of kinds) {
        try {
          const r = await fetch(`/api/portal/${token}${CFG[k].poll}`, { cache: "no-store" });
          if (!r.ok) continue;
          const d = await r.json();
          const n = Number(d?.[CFG[k].countKey] ?? 0);
          const was = prev.current[k];
          prev.current[k] = n;
          if (was !== undefined && n > was && alive) fire(k, n); // só em AUMENTO (não no 1º load)
        } catch { /* ignore */ }
      }
    };
    tick();
    const id = setInterval(tick, 12000);
    const onFocus = () => stopRing();
    window.addEventListener("focus", onFocus);
    return () => { alive = false; clearInterval(id); window.removeEventListener("focus", onFocus); };
  }, [token, enabled, fire, stopRing]);

  useEffect(() => () => stopRing(), [stopRing]);

  function dismiss(id: string) {
    setAlerts((list) => { const next = list.filter((a) => a.id !== id); if (!next.length) stopRing(); return next; });
  }
  function open(a: Alert) { stopRing(); window.location.href = a.url; }
  async function askPerm() {
    if (typeof Notification === "undefined") return;
    await Notification.requestPermission().catch(() => {});
    setNeedPerm(Notification.permission === "default");
    ensurePushSubscribed(); // acabou de permitir → já inscreve pro push com portal fechado
  }

  if (!anyQueue || (!alerts.length && !needPerm)) return null;

  return (
    <div className="paWrap">
      <style>{`
        .paWrap{position:fixed;right:16px;bottom:16px;z-index:60;display:flex;flex-direction:column;gap:10px;max-width:340px;font-family:system-ui,-apple-system,sans-serif}
        @media(max-width:520px){ .paWrap{left:12px;right:12px;max-width:none} }
        .paCard{border:1px solid var(--p-border);background:var(--p-surface);border-radius:13px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:13px 14px;border-left:3px solid var(--p-accent);animation:paIn .22s ease}
        .paCard.rev{border-left-color:var(--p-accent)}
        .paCard.fec{border-left-color:var(--p-crit,#e5484d)}
        @keyframes paIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .paTop{display:flex;gap:10px;align-items:flex-start}
        .paIc{width:34px;height:34px;border-radius:9px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:var(--p-accent-soft);color:var(--p-accent)}
        .paCard.fec .paIc{background:color-mix(in srgb,var(--p-crit,#e5484d) 16%,transparent);color:var(--p-crit,#e5484d)}
        .paTitle{font-size:13.5px;font-weight:700;color:var(--p-text);line-height:1.2}
        .paBody{font-size:12.5px;color:var(--p-muted);margin-top:3px;line-height:1.4}
        .paX{margin-left:auto;background:transparent;border:none;color:var(--p-muted);cursor:pointer;padding:2px;border-radius:6px;flex-shrink:0}
        .paX:hover{background:var(--p-bg)}
        .paBtn{margin-top:10px;width:100%;background:var(--p-accent);color:var(--p-on-accent);border:none;border-radius:9px;padding:9px 12px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
        .paPerm{border:1px dashed var(--p-border);background:var(--p-surface);border-radius:11px;padding:11px 13px;display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--p-muted)}
        .paPerm button{margin-left:auto;background:var(--p-accent);color:var(--p-on-accent);border:none;border-radius:8px;padding:7px 11px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}
      `}</style>

      {alerts.map((a) => {
        const Icon = CFG[a.kind].icon;
        return (
          <div key={a.id} className={`paCard ${a.kind === "revisao" ? "rev" : "fec"}`}>
            <div className="paTop">
              <div className="paIc"><Icon size={17} /></div>
              <div style={{ minWidth: 0 }}>
                <div className="paTitle">{a.title}</div>
                <div className="paBody">{a.body}</div>
              </div>
              <button className="paX" onClick={() => dismiss(a.id)} aria-label="Dispensar"><X size={15} /></button>
            </div>
            <button className="paBtn" onClick={() => open(a)}>Ver agora</button>
          </div>
        );
      })}

      {needPerm && (
        <div className="paPerm">
          <Bell size={15} style={{ flexShrink: 0, color: "var(--p-accent)" }} />
          Ative os avisos na tela pra não perder um lead.
          <button onClick={askPerm}>Ativar</button>
        </div>
      )}
    </div>
  );
}
