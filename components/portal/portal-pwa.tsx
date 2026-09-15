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
  const [expandido, setExpandido] = useState(false);
  const [voltou, setVoltou] = useState(false);
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
  // Cair a conexão não é um detalhe de rodapé: enquanto ela está fora, a tela
  // atrás mente (fica em "Carregando…" para sempre, porque as buscas falham em
  // silêncio). Então o aviso entra em tela cheia, com um símbolo procurando
  // sinal. Quem quiser ler o que já estava carregado fecha, e ele encolhe para
  // uma barra que continua ali enquanto o sinal não volta.
  useEffect(() => {
    const ler = () => {
      const fora = navigator.onLine === false;
      setOffline(fora);
      if (fora) setExpandido(true);        // toda queda nova volta em tela cheia
      else {
        setExpandido(false);
        setVoltou(true);                    // confirma que voltou e some sozinho
        window.setTimeout(() => setVoltou(false), 2600);
      }
    };
    setOffline(navigator.onLine === false);
    setExpandido(navigator.onLine === false);
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
  if (!temVersaoNova && !offline && !voltou && !mostraConvite) return null;

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

        /* Barra compacta: vira botão para reabrir a tela cheia. */
        .vp-aviso.vp-off{text-align:left;cursor:pointer;width:calc(100% - 24px);font:inherit}
        .vp-ponto{flex-shrink:0;width:9px;height:9px;border-radius:50%;background:#ff9f45;
          box-shadow:0 0 0 0 rgba(255,159,69,.6);animation:vpPulso 1.9s ease-out infinite}
        @keyframes vpPulso{70%{box-shadow:0 0 0 9px rgba(255,159,69,0)}100%{box-shadow:0 0 0 0 rgba(255,159,69,0)}}
        .vp-voltou{background:var(--p-good-soft);color:var(--p-good);border-color:transparent;font-weight:700}

        /* ── Tela cheia ─────────────────────────────────────────────────── */
        .vp-tela{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;
          padding:24px;padding-top:calc(24px + env(safe-area-inset-top));
          padding-bottom:calc(24px + env(safe-area-inset-bottom));
          background:color-mix(in srgb,var(--p-bg) 88%,transparent);
          backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%);
          animation:vpEntra .26s ease-out both;font-family:system-ui,-apple-system,sans-serif}
        .vp-cartao{width:100%;max-width:360px;text-align:center;
          background:var(--p-surface);border:1px solid var(--p-border);border-radius:20px;
          padding:30px 24px 24px;box-shadow:0 20px 60px rgba(16,19,28,.22);
          animation:vpCartao .34s cubic-bezier(.22,1,.36,1) both}
        .vp-cartao h2{font-size:19px;font-weight:750;letter-spacing:-.02em;margin:18px 0 8px;color:var(--p-text)}
        .vp-cartao p{font-size:14px;line-height:1.55;color:var(--p-muted);margin:0 0 22px}
        .vp-btn.largo{width:100%;padding:13px;font-size:14.5px;border-radius:12px}
        .vp-procurando{display:block;margin-top:14px;font-size:12px;color:var(--p-muted);opacity:.85}

        .vp-onda{width:74px;height:74px;color:var(--p-accent);display:block;margin:0 auto}
        .vp-onda .corte{stroke:var(--p-muted);opacity:.55}
        .vp-onda .o1,.vp-onda .o2,.vp-onda .o3{opacity:.18;animation:vpOnda 2.1s ease-out infinite}
        .vp-onda .o2{animation-delay:.22s}
        .vp-onda .o3{animation-delay:.44s}
        @keyframes vpOnda{0%{opacity:.18}35%{opacity:1}70%,100%{opacity:.18}}
        @keyframes vpEntra{from{opacity:0}to{opacity:1}}
        @keyframes vpCartao{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}

        @media(prefers-reduced-motion:reduce){
          .vp-aviso,.vp-tela,.vp-cartao{animation:none}
          .vp-onda .o1,.vp-onda .o2,.vp-onda .o3{animation:none;opacity:1}
          .vp-ponto{animation:none}
        }
      `}</style>

      {offline && expandido && (
        <div className="vp-tela" role="alertdialog" aria-modal="true" aria-labelledby="vp-off-titulo">
          <div className="vp-cartao">
            {/* As ondas pulsam de dentro para fora, como quem procura sinal.
                É a única animação da tela e diz uma coisa só: ainda tentando. */}
            <svg className="vp-onda" viewBox="0 0 64 64" fill="none" stroke="currentColor"
                 strokeWidth={3.2} strokeLinecap="round" aria-hidden="true">
              <path className="o1" d="M24 44a12 12 0 0 1 16 0" />
              <path className="o2" d="M16 35a24 24 0 0 1 32 0" />
              <path className="o3" d="M8 26a36 36 0 0 1 48 0" />
              <circle cx="32" cy="52" r="2.6" fill="currentColor" stroke="none" />
              <path className="corte" d="M12 12 L52 52" />
            </svg>
            <h2 id="vp-off-titulo">Sem conexão</h2>
            <p>
              Nada se perdeu. As mensagens que você escrever ficam guardadas aqui
              e saem sozinhas assim que o sinal voltar.
            </p>
            <button className="vp-btn largo" type="button" onClick={() => setExpandido(false)}>
              Entendi
            </button>
            <span className="vp-procurando">Procurando sinal…</span>
          </div>
        </div>
      )}

      {offline && !expandido && (
        <button className="vp-aviso alto vp-off" type="button" onClick={() => setExpandido(true)}>
          <span className="vp-ponto" aria-hidden />
          <div className="texto">
            <b>Sem conexão</b>
            <div className="sub" style={{ color: "#aab3c0" }}>O que você escrever sai quando o sinal voltar.</div>
          </div>
        </button>
      )}

      {voltou && (
        <div className="vp-aviso alto vp-voltou" role="status">
          <span aria-hidden>✓</span>
          <div className="texto"><b>Conexão restabelecida</b></div>
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
