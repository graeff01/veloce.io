"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Tudo que faz o portal se comportar como app instalado, num componente só:
// registra o service worker, avisa quando há versão nova, oferece instalar e
// diz quando a rede caiu.
//
// Antes o service worker só era registrado para quem ligava notificação — ou
// seja, quase ninguém tinha. Sem ele o Android não oferece "Instalar" e nada
// funciona sem sinal.

interface PromptInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const CHAVE_CONVITE = "vp-convite-instalar";

function jaInstalado(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !!standalone || !!iosStandalone;
}

function ehIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function PortalPWA() {
  const [temVersaoNova, setTemVersaoNova] = useState(false);
  const [offline, setOffline] = useState(false);
  const [podeInstalar, setPodeInstalar] = useState(false);
  const [convitePassoAPasso, setConvitePassoAPasso] = useState(false);
  const esperando = useRef<ServiceWorker | null>(null);
  const prompt = useRef<PromptInstalar | null>(null);

  // ── Service worker ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    let vivo = true;

    const anunciar = (reg: ServiceWorkerRegistration) => {
      if (!vivo || !reg.waiting || !navigator.serviceWorker.controller) return;
      // `controller` nulo = primeira instalação; aí não há "versão nova", só a
      // primeira. Avisar nesse caso seria só um susto sem motivo.
      esperando.current = reg.waiting;
      setTemVersaoNova(true);
    };

    navigator.serviceWorker.register("/sw.js").then((reg) => {
      if (!vivo) return;
      anunciar(reg);
      reg.addEventListener("updatefound", () => {
        const novo = reg.installing;
        if (!novo) return;
        novo.addEventListener("statechange", () => { if (novo.state === "installed") anunciar(reg); });
      });
    }).catch(() => { /* navegador sem suporte ou modo privado: segue como site */ });

    // A troca de versão recarrega uma vez só — e SÓ quando é troca mesmo.
    //
    // Na primeira instalação o `clients.claim()` também dispara este evento
    // (o controlador vai de nada para alguém). Sem esta trava, toda primeira
    // visita recarregava sozinha na cara da pessoa, do nada.
    const tinhaControle = !!navigator.serviceWorker.controller;
    let recarregando = false;
    const trocou = () => {
      if (!tinhaControle || recarregando) return;
      recarregando = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", trocou);

    return () => { vivo = false; navigator.serviceWorker.removeEventListener("controllerchange", trocou); };
  }, []);

  const atualizar = useCallback(() => {
    setTemVersaoNova(false);
    esperando.current?.postMessage("ASSUMIR_AGORA");
  }, []);

  // ── Rede ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const ler = () => setOffline(navigator.onLine === false);
    ler();
    window.addEventListener("online", ler);
    window.addEventListener("offline", ler);
    return () => { window.removeEventListener("online", ler); window.removeEventListener("offline", ler); };
  }, []);

  // ── Convite para instalar ──────────────────────────────────────────────────
  useEffect(() => {
    if (jaInstalado()) return;
    let dispensado = false;
    try { dispensado = localStorage.getItem(CHAVE_CONVITE) === "nao"; } catch { /* modo privado */ }
    if (dispensado) return;

    const capturar = (e: Event) => {
      e.preventDefault();               // segura o banner do navegador; o convite é nosso
      prompt.current = e as PromptInstalar;
      setPodeInstalar(true);
    };
    window.addEventListener("beforeinstallprompt", capturar);

    // iOS não tem esse evento: lá a instalação é manual, pelo menu Compartilhar.
    // Sem uma instrução, ninguém descobre — e o app vira "aquele site".
    const t = ehIOS() ? window.setTimeout(() => setConvitePassoAPasso(true), 2500) : 0;

    return () => { window.removeEventListener("beforeinstallprompt", capturar); if (t) clearTimeout(t); };
  }, []);

  const instalar = useCallback(async () => {
    const p = prompt.current;
    if (!p) return;
    setPodeInstalar(false);
    try { await p.prompt(); await p.userChoice; } catch { /* a pessoa fechou */ }
    prompt.current = null;
  }, []);

  const naoQuero = useCallback(() => {
    setPodeInstalar(false);
    setConvitePassoAPasso(false);
    try { localStorage.setItem(CHAVE_CONVITE, "nao"); } catch { /* segue em memória */ }
  }, []);

  const mostraConvite = podeInstalar || convitePassoAPasso;
  if (!temVersaoNova && !offline && !mostraConvite) return null;

  return (
    <>
      <style>{`
        .vp-aviso{position:fixed;left:12px;right:12px;z-index:95;max-width:440px;margin:0 auto;
          border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:12px;
          font-family:system-ui,-apple-system,sans-serif;font-size:13.5px;line-height:1.45;
          border:1px solid var(--p-border);background:var(--p-surface);color:var(--p-text);
          box-shadow:0 10px 34px rgba(16,19,28,.16);
          animation:vpSobe .3s cubic-bezier(.22,1,.36,1) both}
        .vp-aviso.baixo{bottom:calc(96px + env(safe-area-inset-bottom))}
        .vp-aviso.alto{top:calc(10px + env(safe-area-inset-top))}
        .vp-aviso b{font-weight:700}
        .vp-aviso .texto{flex:1;min-width:0}
        .vp-aviso .sub{color:var(--p-muted);font-size:12px;margin-top:2px}
        .vp-btn{flex-shrink:0;border:0;border-radius:10px;padding:8px 13px;font-size:13px;font-weight:700;
          background:var(--p-accent);color:var(--p-on-accent);cursor:pointer;font-family:inherit}
        .vp-x{flex-shrink:0;border:0;background:transparent;color:var(--p-muted);cursor:pointer;
          font-size:17px;line-height:1;padding:6px;border-radius:8px}
        .vp-btn:focus-visible,.vp-x:focus-visible{outline:2px solid var(--p-accent);outline-offset:2px}
        .vp-off{background:#1f2430;color:#f2f4f8;border-color:#2c3341}
        @keyframes vpSobe{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @media(prefers-reduced-motion:reduce){.vp-aviso{animation:none}}
      `}</style>

      {offline && (
        <div className="vp-aviso alto vp-off" role="status">
          <span aria-hidden>📶</span>
          <div className="texto">
            <b>Sem conexão</b>
            <div className="sub" style={{ color: "#aab3c0" }}>O que você escrever sai sozinho quando o sinal voltar.</div>
          </div>
        </div>
      )}

      {temVersaoNova && !offline && (
        <div className="vp-aviso baixo" role="status">
          <div className="texto">
            <b>Nova versão disponível</b>
            <div className="sub">Toque para atualizar agora.</div>
          </div>
          <button className="vp-btn" onClick={atualizar} type="button">Atualizar</button>
          <button className="vp-x" onClick={() => setTemVersaoNova(false)} type="button" aria-label="Agora não">×</button>
        </div>
      )}

      {mostraConvite && !offline && !temVersaoNova && (
        <div className="vp-aviso baixo">
          <div className="texto">
            <b>Instalar na tela inicial</b>
            <div className="sub">
              {podeInstalar
                ? "Abre como aplicativo, sem barra de navegador."
                : "Toque em Compartilhar e depois em “Adicionar à Tela de Início”."}
            </div>
          </div>
          {podeInstalar && <button className="vp-btn" onClick={instalar} type="button">Instalar</button>}
          <button className="vp-x" onClick={naoQuero} type="button" aria-label="Dispensar">×</button>
        </div>
      )}
    </>
  );
}
