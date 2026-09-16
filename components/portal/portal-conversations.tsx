"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ChangeEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search, Eye, Sparkles, Send, ArrowLeft, Megaphone, Paperclip, Camera, Mic, X, UserRound, Check, Sun, Moon, ChevronDown, FileText, Tag as TagIcon, LogOut, Archive, AlertTriangle, Package, Zap, Download } from "lucide-react";
import { MediaContent } from "@/components/whatsapp/wa-media";
import { corDaUrgencia, esperandoDesde, rotuloEspera, urgenciaDe } from "@/lib/portal/espera";

interface Row { contactId: string; name: string; waId: string; lastText: string | null; lastType: string | null; lastDirection: string | null; lastMessageAt: string | null;
  // Já vinham na resposta de /conversations e o portal não usava: são o tempo de
  // espera e o estado que a EQUIPE compartilha (o app já lê os dois).
  conexaoId?: string | null; conexaoNome?: string | null; lastInboundAt?: string | null; lastOutboundAt?: string | null; lida?: boolean; lidaPor?: string | null; arquivada?: boolean; fromAd: boolean; adStrong?: boolean; adTitle: string | null; adModel: string | null; funnelStage: string | null; assignedEmail?: string | null; assignedName?: string | null; tags?: { id: string; name: string; color: string }[] }
interface Attendant { email: string; name: string }

// Rótulo do anúncio de origem (chave de agrupamento). Prioriza o modelo detectado.
const adLabelOf = (c: Row) => (c.adModel || c.adTitle || "Sem identificação").trim();
// "Aguardando resposta": a última mensagem foi do LEAD (entrada) e ninguém respondeu.
const isWaiting = (c: Row) => c.lastDirection != null && c.lastDirection !== "out";
interface Msg { id: string; text: string | null; direction: string; type: string; timestamp: string; aiGenerated?: boolean; pending?: boolean; sentByName?: string | null; transcription?: string | null; deliveredAt?: string | null; readAt?: string | null; reaction?: string | null }
interface Conv { contact: { name: string }; lead: { adTitle: string | null; adModel: string | null; adBody: string | null; sourceUrl: string | null; image: string | null; adStrong?: boolean } | null; funnelStage: string | null; funnelEvidence: string | null; windowOpen?: boolean; lastInboundAt?: string | null; assignedEmail?: string | null; assignedName?: string | null; me?: string | null; meName?: string | null; attendants?: Attendant[]; tags?: { id: string; name: string; color: string }[]; items: Msg[] }
// Paleta pra novas etiquetas (cor rotativa na criação).
const TAG_COLORS = ["#EF4444", "#F59E0B", "#EAB308", "#10B981", "#14B8A6", "#3B82F6", "#8B5CF6", "#EC4899", "#64748B"];

const STAGE: Record<string, [string, string]> = {
  recebido: ["Recebido", "var(--wa-muted)"], respondido: ["Respondido", "#2563EB"], qualificado: ["Qualificado", "#2563EB"],
  negociacao: ["Negociação", "#7C3AED"], convertido: ["Convertido", "#16A34A"], perdido: ["Perdido", "#d6453d"],
};
const STAGE_ORDER = ["recebido", "respondido", "qualificado", "negociacao", "convertido", "perdido"];
function StageBadge({ stage }: { stage: string | null }) {
  if (!stage) return null;
  const [label, color] = STAGE[stage] ?? [stage, "var(--wa-muted)"];
  return <span style={{ fontSize: 10.5, fontWeight: 700, color, background: `color-mix(in srgb, ${color} 16%, transparent)`, padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>{label}</span>;
}
const mediaLabel = (t: string) => ({ image: "📷 Foto", audio: "🎤 Áudio", video: "🎬 Vídeo", document: "📎 Documento", sticker: "Figurinha", location: "📍 Localização" } as Record<string, string>)[t] ?? null;
const preview = (text: string | null, type: string | null) => (text && text.trim()) || (type ? mediaLabel(type) : null) || "—";
function hhmm(iso: string | null) { if (!iso) return ""; return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
function listTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return hhmm(iso);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function dayLabel(iso: string) {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return "HOJE";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "ONTEM";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).toUpperCase();
}
// Miniatura de imagem recebida (o lead mandou foto). Fallback pro rótulo se falhar.
// A foto abria em ABA NOVA (`target="_blank"`): tirava a vendedora da conversa e
// ainda punha o endereço da API — que carrega o token do portal — na barra e no
// histórico do navegador. Agora abre num VISOR sobre a página, com zoom nativo
// (a própria imagem cresce no clique) e sem sair de onde ela está.
function ThreadImage({ src, caption }: { src: string; caption: string | null }) {
  const [err, setErr] = useState(false);
  const [aberta, setAberta] = useState(false);
  const [zoom, setZoom] = useState(false);

  // Esc fecha, como em qualquer visor. Só escuta enquanto está aberto.
  useEffect(() => {
    if (!aberta) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setAberta(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberta]);

  if (err) return <span>📷 Foto{caption ? ` · ${caption}` : ""}</span>;
  return (
    <>
      <button onClick={() => { setAberta(true); setZoom(false); }} aria-label="Abrir a foto" style={{ display: "block", border: "none", background: "transparent", padding: 0, cursor: "zoom-in", width: "100%", textAlign: "left", color: "inherit" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Foto do lead" loading="lazy" onError={() => setErr(true)} style={{ maxWidth: 240, width: "100%", borderRadius: 9, display: "block" }} />
        {caption && caption.trim() && <span style={{ display: "block", marginTop: 5 }}>{caption}</span>}
      </button>

      {aberta && (
        <div role="dialog" aria-label="Foto do lead" onClick={() => setAberta(false)}
          style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,.94)", display: "flex", alignItems: "center", justifyContent: "center", overflow: zoom ? "auto" : "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Foto do lead"
            onClick={(e) => { e.stopPropagation(); setZoom((z) => !z); }}
            style={zoom
              ? { width: "auto", maxWidth: "none", height: "auto", cursor: "zoom-out" }
              : { maxWidth: "94vw", maxHeight: "88vh", objectFit: "contain", cursor: "zoom-in" }} />
          <button onClick={(e) => { e.stopPropagation(); setAberta(false); }} aria-label="Fechar foto"
            style={{ position: "fixed", top: 18, right: 18, width: 34, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", border: "none", background: "rgba(255,255,255,.14)", color: "#fff", cursor: "pointer" }}>
            <X size={18} />
          </button>
          {/* A foto do lead é material de trabalho: vai para o orçamento e para o
              instalador. O download é o "salvar" do navegador. */}
          <a href={src} download onClick={(e) => e.stopPropagation()} aria-label="Salvar a foto"
            style={{ position: "fixed", top: 18, left: 18, width: 34, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "rgba(255,255,255,.14)", color: "#fff", textDecoration: "none" }}>
            <Download size={17} />
          </a>
          {caption && caption.trim() && (
            <span style={{ position: "fixed", left: 0, right: 0, bottom: 22, textAlign: "center", color: "#fff", fontSize: 13, padding: "0 24px", textShadow: "0 1px 4px rgba(0,0,0,.6)" }}>{caption}</span>
          )}
        </div>
      )}
    </>
  );
}
function avatarColor(name: string) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 42% 52%)`; }
// Formata o telefone (waId é E.164 sem "+", ex.: 5551991597229 → +55 51 99159-7229).
function formatPhone(wa: string) {
  const d = (wa || "").replace(/\D/g, "");
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : d ? `+${d}` : "";
}
// Versão compacta (sem +55) para a LISTA — cabe melhor no celular.
function formatPhoneShort(wa: string) {
  const d = (wa || "").replace(/\D/g, "");
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  return m ? `${m[1]} ${m[2]}-${m[3]}` : d ? `+${d}` : "";
}
// True quando o "nome" exibido JÁ é o próprio número (contato sem nome salvo) — aí não
// mostramos o número duas vezes.
function nameIsNumber(name: string, wa: string) {
  const dn = (name || "").replace(/\D/g, "");
  return !!dn && dn === (wa || "").replace(/\D/g, "");
}
function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: avatarColor(name || "?"), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.4 }}>{(name || "?")[0]?.toUpperCase()}</div>;
}

export function PortalConversations({ token, brandName, logoUrl, chatBgUrl, initialContact, quotesEnabled }: { token: string; brandName: string; logoUrl: string | null; chatBgUrl?: string | null; initialContact?: string | null; quotesEnabled?: boolean }) {
  // Marca d'água do chat: imagem própria do cliente (portal-bg) quando houver; senão o logo.
  const chatWatermark = chatBgUrl || logoUrl;
  // Sem rede, as buscas falham em silêncio e a lista fica em "Carregando…"
  // para sempre — a tela passa a mentir justo quando a pessoa mais precisa
  // entender o que está acontecendo.
  const [semRede, setSemRede] = useState(false);
  useEffect(() => {
    const ler = () => setSemRede(typeof navigator !== "undefined" && navigator.onLine === false);
    ler();
    window.addEventListener("online", ler);
    window.addEventListener("offline", ler);
    return () => { window.removeEventListener("online", ler); window.removeEventListener("offline", ler); };
  }, []);

  // Impressão da última lista recebida (ver lib/portal-lista-etag.ts).
  const etagLista = useRef<string | null>(null);
  const [list, setList] = useState<Row[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tab, setTab] = useState<"all" | "ads" | "waiting" | "arquivadas">("all");
  const [campanhaModal, setCampanhaModal] = useState(false);
  // Relógio único da lista: o rótulo "há 12min" precisa envelhecer sozinho, e um
  // intervalo por linha seria desperdício. Mesma cadência do aplicativo.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const [adFilter, setAdFilter] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(initialContact ?? null);
  const [conv, setConv] = useState<Conv | null>(null);
  const [loadingConv, setLoadingConv] = useState(false);
  const [aiReplying, setAiReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  // A BARRA INFERIOR aparece em tudo abaixo de 1024px (onde o menu lateral
  // assume). Não é a mesma pergunta que `isMobile` (≤760px, que decide o layout
  // de uma coluna) — e confundir as duas deixava a última conversa escondida
  // atrás da barra nas larguras intermediárias.
  const [temBarra, setTemBarra] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  // Números do cliente. Um cliente pode atender por vários (a Jardim do Lago tem
  // seis, três da consultoria e três da captação) e a caixa junta todos; este
  // filtro é o que deixa olhar UM deles de cada vez.
  const [conexoes, setConexoes] = useState<{ id: string; nome: string; equipe: string | null }[]>([]);
  // Quem só ACOMPANHA (gestor). O servidor recusa qualquer escrita dela; a tela
  // esconde as ações pelo motivo oposto do de costume: não é segurança, é não
  // oferecer o que vai ser recusado. A pessoa levaria a culpa por um erro que o
  // produto criou ao mostrar o botão.
  const [somenteLeitura, setSomenteLeitura] = useState(false);
  // De qual número é esta caixa. Vem da URL porque quem escolhe é o ATALHO — o
  // menu lateral no computador, a barra no celular —, não um controle dentro da
  // lista. As abas que ficavam aqui ocupavam uma faixa acima das conversas em
  // toda tela, o tempo todo, para uma escolha que se faz de vez em quando.
  // Como está na URL, a escolha sobrevive a recarregar e pode virar link.
  const searchParams = useSearchParams();
  const conexaoFiltro = searchParams?.get("conexao") || null;
  // Recorte vindo da tela de Equipe: "os 12 que nunca responderam", "a fila da
  // Ana". Sem isto, o diagnóstico apontava o problema e parava ali — ela via o
  // número e não tinha como chegar nas conversas.
  const estadoFiltro = searchParams?.get("estado") || null;
  const donoFiltro = searchParams?.get("dono") || null;
  /** Acrescenta o recorte na consulta. Num lugar só: três cópias divergiriam. */
  const recorte = (sp: URLSearchParams) => {
    if (estadoFiltro) sp.set("estado", estadoFiltro);
    if (donoFiltro) sp.set("dono", donoFiltro);
  };
  const [mineOnly, setMineOnly] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [assigning, setAssigning] = useState(false);
  const [ownerMenu, setOwnerMenu] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [stageMenu, setStageMenu] = useState(false);
  const [stageSaving, setStageSaving] = useState(false);
  const [reviewCount, setReviewCount] = useState(0); // orçamentos aguardando aprovação (badge do atalho Orçamentos)
  const [waitingCount, setWaitingCount] = useState(0); // "aguardando" (badge) — via /badges, IGUAL às outras telas
  const [allTags, setAllTags] = useState<{ id: string; name: string; color: string }[]>([]); // etiquetas do cliente
  const [tagMenu, setTagMenu] = useState(false);
  // Pré-visualização antes de enviar mídia (imagem/documento): confirma com legenda.
  const [pendingMedia, setPendingMedia] = useState<{ kind: "image" | "document"; file: File; url: string | null } | null>(null);
  const [mediaCaption, setMediaCaption] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<{ mr: MediaRecorder; chunks: Blob[]; stream: MediaStream; mime: string; timer: ReturnType<typeof setInterval> } | null>(null);
  const nearBottomRef = useRef(true);
  const qRef = useRef("");
  const loadedMoreRef = useRef(false);
  const PAGE = 50;
  const onScroll = () => { const el = scrollRef.current; if (el) nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; };

  // Tema (claro/escuro) — a MESMA chave/atributo do resto do painel, mantendo a cor da
  // empresa (accent). Deixa o vendedor trocar o tema aqui dentro das conversas (no mobile
  // a sidebar do painel fica escondida, então este é o único acesso).
  useEffect(() => { setTheme(document.documentElement.getAttribute("data-pt") === "dark" ? "dark" : "light"); }, []);
  // Etiquetas do cliente (pra o menu de tags). Carrega uma vez.
  useEffect(() => {
    fetch(`/api/portal/${token}/tags`).then((r) => (r.ok ? r.json() : [])).then((d) => setAllTags(Array.isArray(d) ? d : [])).catch(() => {});
  }, [token]);
  // Badges (Aguardando + Orçamentos): MESMOS counts do /badges que a barra usa nas OUTRAS
  // telas — assim o número é IDÊNTICO em qualquer aba (antes o "aguardando" era contado na
  // lista carregada e divergia do total mostrado na tela de Orçamentos).
  useEffect(() => {
    let alive = true;
    const tick = () => fetch(`/api/portal/${token}/badges`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d) { setWaitingCount(d.waiting ?? 0); setReviewCount(d.reviews ?? 0); } }).catch(() => {});
    tick();
    const id = setInterval(tick, 20000);
    return () => { alive = false; clearInterval(id); };
  }, [token]);
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-pt", next);
    try { localStorage.setItem(`pt-${token}`, next); } catch { /* ignore */ }
  }
  // Sair da conta (no mobile a sidebar do painel — que tem o "Sair" — fica escondida, então
  // este é o único acesso pra sair / trocar de conta pelo telefone).
  async function logout() {
    if (!confirm("Sair da conta?")) return;
    await fetch(`/api/portal/${token}/auth/logout`, { method: "POST" }).catch(() => {});
    window.location.href = `/r/${token}`;
  }

  // Filtro inicial via ?tab= — a barra mobile de OUTRAS telas (ex.: Revisão) linka pra cá com
  // ?tab=waiting/ads pra manter o filtro ao voltar. Só na montagem.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "waiting" || t === "ads" || t === "arquivadas") setTab(t);
  }, []);

  // ── Dentro da conversa, no celular, o portal sai da frente ─────────────────
  // A tela da conversa JÁ TEM o seu próprio cabeçalho (voltar, nome do lead,
  // ações) e o seu compositor. Somados aos do portal viravam dois cabeçalhos
  // empilhados e uma barra de atalhos flutuando POR CIMA do campo de escrever —
  // com o botão de enviar atrás dela.
  //
  // A marca vai no <html> porque quem precisa sumir são componentes IRMÃOS,
  // montados pela página, fora desta árvore. É a mesma regra do aplicativo
  // (apps/mobile/src/ui/nav.tsx), e pelo mesmo motivo.
  useEffect(() => {
    const dentro = isMobile && !!sel;
    const html = document.documentElement;
    if (dentro) html.setAttribute("data-conversa-aberta", "1");
    else html.removeAttribute("data-conversa-aberta");
    // Sair da tela com a marca posta deixaria o portal sem cabeçalho nem barra
    // na página seguinte.
    return () => html.removeAttribute("data-conversa-aberta");
  }, [isMobile, sel]);

  // Mobile-first: em telas estreitas vira 1 coluna (lista OU thread, com botão voltar).
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const mqBarra = window.matchMedia("(max-width: 1023px)");
    const apply = () => { setIsMobile(mq.matches); setTemBarra(mqBarra.matches); };
    apply();
    mq.addEventListener("change", apply);
    mqBarra.addEventListener("change", apply);
    return () => { mq.removeEventListener("change", apply); mqBarra.removeEventListener("change", apply); };
  }, []);

  // Lista de conversas — carrega e AUTO-ATUALIZA (novos leads/mensagens sem F5).
  // Carga da 1ª página + BUSCA no servidor (debounce leve). A busca acha QUALQUER conversa, de
  // qualquer data (não só as carregadas). Ao (re)buscar, volta pra página 1 (loadedMore=false).
  useEffect(() => {
    let alive = true;
    qRef.current = q.trim();
    loadedMoreRef.current = false;
    const t = setTimeout(() => {
      const sp = new URLSearchParams({ limit: String(PAGE), offset: "0" });
      if (q.trim()) sp.set("q", q.trim());
      if (mineOnly) sp.set("owner", "me"); // "Minhas conversas" no SERVIDOR (pega todas, não só a página)
      // Arquivadas vivem FORA da caixa: o servidor as exclui por padrão e só as
      // devolve quando pedidas. Sem isto, arquivar não tiraria nada da frente.
      if (tab === "arquivadas") sp.set("arquivadas", "1");
      if (conexaoFiltro) sp.set("conexao", conexaoFiltro); // filtro por número, no SERVIDOR
      recorte(sp);
      fetch(`/api/portal/${token}/conversations?${sp}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (!alive || !d) return;
        setMe(d.me ?? null); setIsAdmin(!!d.isAdmin); setAttendants(d.attendants ?? []);
        setSomenteLeitura(!!d.somenteLeitura);
        setConexoes(d.conexoes ?? []);
        setHasMore(!!d.hasMore); setList(d.conversations ?? []);
      }).catch(() => {});
    }, q.trim() ? 300 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [token, q, mineOnly, tab, conexaoFiltro, estadoFiltro, donoFiltro]);

  // Auto-atualização: quem manda mensagem SOBE PARA O TOPO, como no WhatsApp.
  //
  // Dois defeitos corrigidos aqui:
  //   1. A consulta não levava `arquivadas=1`. Estando na aba Arquivadas, a cada
  //      seis segundos a lista era trocada pela caixa NORMAL — a aba se desfazia
  //      sozinha na frente da pessoa.
  //   2. Depois de "Carregar mais" o refresh era desligado PARA SEMPRE
  //      (loadedMoreRef), para não descartar as páginas já carregadas. O efeito
  //      colateral era este: a lista parava de reordenar, e o lead que acabou de
  //      escrever ficava enterrado onde estava.
  //
  // Agora FUNDE em vez de substituir: a primeira página (que o servidor já manda
  // ordenada pela mensagem mais recente) vem na frente, e o que foi carregado
  // além dela segue embaixo, na ordem em que estava. Assim reordena sem perder
  // histórico, e o "Carregar mais" deixa de ser um caminho sem volta.
  useEffect(() => {
    const reload = () => {
      if (document.hidden || qRef.current) return;
      const sp = new URLSearchParams({ limit: String(PAGE), offset: "0" });
      if (mineOnly) sp.set("owner", "me");
      if (tab === "arquivadas") sp.set("arquivadas", "1");
      if (conexaoFiltro) sp.set("conexao", conexaoFiltro);
      recorte(sp);
      // Pergunta condicional: "mudou algo desde a impressão que eu tenho?".
      // Quando não mudou, o servidor responde 304 sem montar nada e sem mandar
      // um byte de corpo — que é o caso na esmagadora maioria das batidas.
      const cabecalhos: HeadersInit = etagLista.current ? { "If-None-Match": etagLista.current } : {};
      fetch(`/api/portal/${token}/conversations?${sp}`, { headers: cabecalhos }).then((r) => {
        if (r.status === 304) return null;   // nada mudou: a tela já está certa
        if (!r.ok) return null;
        etagLista.current = r.headers.get("ETag");
        return r.json();
      }).then((d) => {
        if (!d) return;
        setMe(d.me ?? null); setIsAdmin(!!d.isAdmin); setAttendants(d.attendants ?? []);
        setSomenteLeitura(!!d.somenteLeitura);
        setConexoes(d.conexoes ?? []);
        const frescas: Row[] = d.conversations ?? [];
        const naPrimeira = new Set(frescas.map((c) => c.contactId));
        setList((antiga) => {
          if (!antiga || !loadedMoreRef.current) { setHasMore(!!d.hasMore); return frescas; }
          // Só as páginas EXTRAS ficam embaixo; `hasMore` segue sendo delas.
          return [...frescas, ...antiga.filter((c) => !naPrimeira.has(c.contactId))];
        });
      }).catch(() => {});
    };
    etagLista.current = null;  // mudou o recorte: a impressão anterior não vale
    const iv = setInterval(reload, 6000);
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", reload);
    return () => { clearInterval(iv); window.removeEventListener("focus", reload); document.removeEventListener("visibilitychange", reload); };
  }, [token, mineOnly, tab, conexaoFiltro, estadoFiltro, donoFiltro]);

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    loadedMoreRef.current = true;
    const sp = new URLSearchParams({ limit: String(PAGE), offset: String(list?.length ?? 0) });
    if (q.trim()) sp.set("q", q.trim());
    if (mineOnly) sp.set("owner", "me");
    if (tab === "arquivadas") sp.set("arquivadas", "1");
    if (conexaoFiltro) sp.set("conexao", conexaoFiltro);
    recorte(sp);
    fetch(`/api/portal/${token}/conversations?${sp}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d) { setHasMore(!!d.hasMore); setList((prev) => [...(prev ?? []), ...(d.conversations ?? [])]); }
      setLoadingMore(false);
    }).catch(() => setLoadingMore(false));
  };

  // Conversa aberta — carrega (com spinner) e AUTO-ATUALIZA em silêncio (novas mensagens).
  useEffect(() => {
    if (!sel) { setConv(null); return; }
    let alive = true;
    nearBottomRef.current = true; // ao abrir uma conversa, começa no fim
    setDraft(lerRascunho(sel)); setSendError(null); // volta o que ela tinha escrito

    // Corte do divisor: a última visita ANTES de registrar a de agora.
    try {
      const anterior = localStorage.getItem(visitaKey(sel));
      setCorteNovas(anterior ? Number(anterior) || null : null);
      localStorage.setItem(visitaKey(sel), String(Date.now()));
    } catch { setCorteNovas(null); }

    // Abrir marca como lida para a EQUIPE, no servidor — não só neste navegador.
    // São três vendedoras no MESMO número: lido por uma precisa sumir do negrito
    // das outras, e do aplicativo. Melhor esforço: falhar aqui não pode
    // atrapalhar a leitura da conversa.
    fetch(`/api/portal/${token}/conversations/${sel}/state`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lida: true }),
    }).catch(() => {});
    setList((l) => (l ? l.map((row) => (row.contactId === sel ? { ...row, lida: true } : row)) : l));
    const load = (silent: boolean) => {
      if (!silent) setLoadingConv(true);
      return fetch(`/api/portal/${token}/conversations/${sel}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (!alive) return;
        // Reconcilia: preserva bolhas otimistas ainda não confirmadas pelo servidor
        // (dedup por texto — se a real já chegou no polling, descarta a otimista).
        setConv((prev) => {
          if (!d) return silent ? prev : d;
          if (!prev) return d;
          const serverOut = new Set(d.items.filter((m: Msg) => m.direction === "out").map((m: Msg) => (m.text || "").trim()));
          const keptPending = prev.items.filter((m) => m.pending && !serverOut.has((m.text || "").trim()));
          return { ...d, items: [...d.items, ...keptPending] };
        });
        if (!silent) setLoadingConv(false);
      }).catch(() => { if (alive && !silent) setLoadingConv(false); });
    };
    load(false);
    // TEMPO REAL: o servidor EMPURRA (SSE) assim que chega mensagem nova → recarrega na hora.
    //
    // O stream é caro do LADO DE LÁ: enquanto ele está aberto, o servidor
    // consulta o banco a cada 1,2s procurando mensagem nova. Uma aba esquecida
    // em segundo plano mantinha isso rodando — 50 consultas por minuto para
    // ninguém. Então a conexão FECHA quando a aba sai de vista e reabre ao
    // voltar, com um recarregamento na hora para não perder o que chegou no
    // meio-tempo.
    let es: EventSource | null = null;
    const abrirStream = () => {
      if (es || document.hidden) return;
      try {
        es = new EventSource(`/api/portal/${token}/conversations/${sel}/stream`);
        es.onmessage = () => { if (alive && !document.hidden) load(true); };
        // onerror: o EventSource reconecta sozinho; o polling abaixo cobre qualquer buraco.
      } catch { /* navegador sem SSE → só o polling */ }
    };
    const fecharStream = () => { if (es) { es.close(); es = null; } };
    abrirStream();

    // Rede de segurança: polling mais lento (8s) + refetch imediato ao voltar pra aba/janela.
    const iv = setInterval(() => { if (!document.hidden) load(true); }, 8000);
    const onActive = () => {
      if (document.hidden) { fecharStream(); return; }
      abrirStream();
      load(true);
    };
    window.addEventListener("focus", onActive);
    document.addEventListener("visibilitychange", onActive);
    return () => { alive = false; fecharStream(); clearInterval(iv); window.removeEventListener("focus", onActive); document.removeEventListener("visibilitychange", onActive); };
  }, [sel, token]);

  // Rola pro fim quando abre a conversa ou chega mensagem nova — mas só se já estava embaixo.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [conv?.items?.length, sel]);

  // Anúncios distintos (para os filtros por anúncio), com contagem, do mais frequente.
  const adGroups = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of list ?? []) if (c.fromAd) { const k = adLabelOf(c); m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }, [list]);

  // A aba "Leads de anúncio" só aparece se o cliente REALMENTE tem leads de anúncio
  // (cliente que só usa a IA não vê um atalho vazio). Se sumir, volta pra "Conversas".
  // A aba de anúncio some quando a LISTA CARREGADA não tem lead de anúncio — e
  // em "Arquivadas" ela quase nunca tem. Resultado: entrar em Arquivadas fazia a
  // aba Anúncio desaparecer. A pergunta certa é "este CLIENTE tem leads de
  // anúncio?", que não muda ao trocar de filtro. Uma vez visto, fica.
  const [clienteTemAds, setClienteTemAds] = useState(false);
  useEffect(() => { if (adGroups.length > 0) setClienteTemAds(true); }, [adGroups.length]);
  const hasAds = clienteTemAds;
  useEffect(() => { if (!hasAds && tab === "ads") { setTab("all"); setAdFilter(null); } }, [hasAds, tab]);

  const items = (list ?? []).filter((c) => {
    if (mineOnly && (!me || c.assignedEmail !== me)) return false;
    if (tab === "ads" && !c.fromAd) return false;
    if (tab === "ads" && adFilter && adLabelOf(c) !== adFilter) return false;
    if (tab === "waiting" && !isWaiting(c)) return false;
    // A BUSCA (q) agora é no SERVIDOR — aqui fica só o filtro de aba/atendente/anúncio.
    return true;
  });
  const myWaiting = (list ?? []).filter((c) => me && c.assignedEmail === me && isWaiting(c)).length;

  // agrupa mensagens por dia (divisores estilo WhatsApp)
  const grouped = useMemo(() => {
    const out: { day: string; msgs: Msg[] }[] = [];
    for (const m of conv?.items ?? []) {
      const day = dayLabel(m.timestamp);
      const last = out[out.length - 1];
      if (last && last.day === day) last.msgs.push(m); else out.push({ day, msgs: [m] });
    }
    return out;
  }, [conv]);

  // Aciona a IA pra responder o lead a partir do portal (mesmo em horário comercial).
  // A IA só responde o que sabe; se for do vendedor, não envia e avisa.
  async function aiReply() {
    if (!sel || aiReplying) return;
    setAiReplying(true);
    try {
      const r = await fetch(`/api/portal/${token}/conversations/${sel}/ai-reply`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { alert(d.error || "Não foi possível gerar a resposta da IA."); return; }
      const rr = await fetch(`/api/portal/${token}/conversations/${sel}`);
      const dd = await rr.json().catch(() => null);
      if (dd) setConv(dd);
    } finally { setAiReplying(false); }
  }

  // ── Respostas rápidas ─────────────────────────────────────────────────────
  // Sem isto a vendedora redigita as mesmas frases o dia inteiro: saudação,
  // condições de frete, chave PIX. O aplicativo já tem; aqui vai o mesmo.
  //
  // POR NAVEGADOR, não por equipe — igual ao app, que guarda no aparelho.
  // Compartilhar entre as três vendedoras seria melhor produto (a Maria escreve,
  // a Ana usa), mas exige tabela nova e migration; fica anotado como decisão,
  // não resolvido por conta própria.
  const respostasKey = `vp-respostas-${token}`;
  const [respostas, setRespostas] = useState<string[]>([]);
  const [respostasAbertas, setRespostasAbertas] = useState(false);

  useEffect(() => {
    try {
      const cru = localStorage.getItem(respostasKey);
      const v = cru ? JSON.parse(cru) : [];
      if (Array.isArray(v)) setRespostas(v.filter((x) => typeof x === "string"));
    } catch { /* lista corrompida é lista vazia */ }
  }, [respostasKey]);

  const gravarRespostas = (lista: string[]) => {
    setRespostas(lista);
    try { localStorage.setItem(respostasKey, JSON.stringify(lista)); } catch { /* segue em memória */ }
  };

  function novaResposta() {
    const t = window.prompt("Nova resposta rápida:\n\nEla fica guardada neste navegador e entra no compositor com um clique.");
    if (t && t.trim()) gravarRespostas([...respostas, t.trim()]);
  }

  // ── Busca dentro da conversa ──────────────────────────────────────────────
  // O Ctrl+F do navegador acha, mas não navega entre ocorrências nem diz quantas
  // são — e numa conversa de meses isso é a diferença entre achar o endereço e
  // rolar procurando. O aplicativo já tinha; aqui vai o mesmo.
  const [buscaThread, setBuscaThread] = useState("");
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [achadoAtual, setAchadoAtual] = useState(0);

  const achados = useMemo(() => {
    const termo = buscaThread.trim().toLowerCase();
    if (!termo) return [] as string[];
    return (conv?.items ?? [])
      .filter((m) => ((m.text ?? "") + " " + (m.transcription ?? "")).toLowerCase().includes(termo))
      .map((m) => m.id);
  }, [buscaThread, conv]);

  useEffect(() => { setAchadoAtual(0); }, [buscaThread]);
  useEffect(() => { if (!sel) { setBuscaAberta(false); setBuscaThread(""); } }, [sel]);

  /** Rola até a ocorrência e a destaca por um instante. */
  const irParaAchado = (passo: number) => {
    if (achados.length === 0) return;
    const i = (achadoAtual + passo + achados.length) % achados.length;
    setAchadoAtual(i);
    const el = document.getElementById(`msg-${achados[i]}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  /**
   * Devolve a conversa ao estado de pendente PARA A EQUIPE. Passou a importar
   * mais agora que a leitura é compartilhada: o que uma abre some do negrito das
   * outras, e sem isto não havia como desfazer — "abri, li, respondo depois"
   * virava uma conversa que ninguém mais via como pendente.
   */
  async function marcarNaoLida() {
    if (!sel) return;
    const id = sel;
    await fetch(`/api/portal/${token}/conversations/${id}/state`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lida: false }),
    }).catch(() => {});
    setList((l) => (l ? l.map((row) => (row.contactId === id ? { ...row, lida: false } : row)) : l));
    // Volta para a lista: ficar dentro da conversa que acabou de ser marcada
    // como não lida é contraditório — e o efeito de abrir a marcaria de novo.
    setSel(null);
  }

  // ── Rascunho por conversa ─────────────────────────────────────────────────
  // Antes o compositor era LIMPO ao trocar de conversa ("compositor limpo por
  // conversa"). Na prática: escreveu meia resposta, pulou para outra conversa
  // conferir um preço, voltou — e o texto tinha sumido. O aplicativo guarda por
  // conversa, e é o que passa a valer aqui.
  const rascunhoKey = (id: string) => `vp-rascunho-${token}-${id}`;
  const lerRascunho = (id: string) => {
    try { return localStorage.getItem(rascunhoKey(id)) ?? ""; } catch { return ""; }
  };
  const gravarRascunho = (id: string, texto: string) => {
    try {
      if (texto.trim()) localStorage.setItem(rascunhoKey(id), texto);
      else localStorage.removeItem(rascunhoKey(id));
    } catch { /* sem espaço: o rascunho segue só em memória */ }
  };

  // ── Divisor "mensagens novas" ─────────────────────────────────────────────
  // Guarda o instante da ÚLTIMA visita a cada conversa, NESTE navegador. É
  // legitimamente por aparelho: o divisor responde "onde eu parei", não "onde a
  // equipe parou" — para a equipe existe o `lida`, que mora no servidor.
  const visitaKey = (id: string) => `vp-visita-${token}-${id}`;
  const [corteNovas, setCorteNovas] = useState<number | null>(null);
  // O divisor aparece UMA vez. Sem esta trava ele nasceria antes de cada
  // mensagem nova, e viraria listra em vez de marcação.
  const marcouNovas = useRef(false);
  useEffect(() => { marcouNovas.current = false; }, [sel, corteNovas, conv]);

  // ── Fila de envio ─────────────────────────────────────────────────────────
  // Antes: falhou a rede, a mensagem voltava para a caixa de texto com um aviso
  // e a vendedora tinha de reenviar na mão. Agora ela fica guardada e sai
  // sozinha — o mesmo comportamento do aplicativo.
  //
  // Vive no localStorage por CONVERSA: recarregar a aba ou fechar o navegador no
  // meio de uma queda não pode perder o que a pessoa escreveu.
  interface Pendente { id: string; chave: string; contactId: string; text: string; tentativas: number; criadoEm: number }
  const FILA_CHAVE = `vp-fila-${token}`;
  const VALIDADE_MS = 60 * 60_000;   // 1h, como no app: depois disso o contexto morreu
  const [fila, setFila] = useState<Pendente[]>([]);

  // Lê a fila salva UMA vez, na montagem. localStorage pode falhar (modo privado,
  // cota) e isso nunca pode impedir a tela de abrir.
  useEffect(() => {
    try {
      const cru = localStorage.getItem(FILA_CHAVE);
      const salvos: Pendente[] = cru ? JSON.parse(cru) : [];
      const vivos = Array.isArray(salvos) ? salvos.filter((p) => Date.now() - p.criadoEm < VALIDADE_MS) : [];
      if (vivos.length) setFila(vivos);
    } catch { /* fila corrompida é fila vazia, nunca um erro na tela */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { localStorage.setItem(FILA_CHAVE, JSON.stringify(fila)); } catch { /* sem espaço: a fila segue em memória */ }
  }, [fila, FILA_CHAVE]);

  const enfileirar = (p: Pendente) => setFila((f) => [...f, p]);

  // Uma tentativa por ciclo, do mais antigo para o mais novo: manter a ORDEM das
  // mensagens importa mais do que despachar rápido. O intervalo cresce com as
  // tentativas para não martelar um servidor que já está com problema.
  useEffect(() => {
    if (fila.length === 0) return;
    const primeiro = fila[0];
    const espera = Math.min(30_000, 2_000 * Math.pow(2, Math.min(primeiro.tentativas, 4)));
    const id = setTimeout(async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setFila((f) => f.map((x) => (x.id === primeiro.id ? { ...x, tentativas: x.tentativas + 1 } : x)));
        return;
      }
      try {
        const r = await fetch(`/api/portal/${token}/conversations/${primeiro.contactId}/send`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: primeiro.text, key: primeiro.chave }),
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok) {
          // Saiu (ou já tinha saído, e o servidor disse `duplicada`). Fora da fila.
          setFila((f) => f.filter((x) => x.id !== primeiro.id));
          if (d?.message && sel === primeiro.contactId) {
            setConv((c) => (c ? { ...c, items: c.items.map((m) => (m.id === primeiro.id ? (d.message as Msg) : m)) } : c));
          }
          return;
        }
        // O servidor RESPONDEU e recusou: insistir não muda nada. Sai da fila e
        // o texto volta para a caixa, com o motivo à vista.
        setFila((f) => f.filter((x) => x.id !== primeiro.id));
        setConv((c) => (c ? { ...c, items: c.items.filter((m) => m.id !== primeiro.id) } : c));
        if (sel === primeiro.contactId) {
          setDraft((cur) => cur || primeiro.text);
          setSendError(d?.error || "Não foi possível enviar a mensagem.");
        }
      } catch {
        // Ainda sem rede: conta a tentativa e espera mais da próxima vez.
        setFila((f) => f.map((x) => (x.id === primeiro.id ? { ...x, tentativas: x.tentativas + 1 } : x)));
      }
    }, espera);
    return () => clearTimeout(id);
  }, [fila, token, sel]);

  // Passou da validade: o contexto da conversa morreu e mandar agora seria pior
  // do que não mandar. Sai da fila e o texto volta para a caixa.
  useEffect(() => {
    const velhas = fila.filter((p) => Date.now() - p.criadoEm >= VALIDADE_MS);
    if (velhas.length === 0) return;
    setFila((f) => f.filter((p) => Date.now() - p.criadoEm < VALIDADE_MS));
    setConv((c) => (c ? { ...c, items: c.items.filter((m) => !velhas.some((v) => v.id === m.id)) } : c));
    const minha = velhas.find((p) => p.contactId === sel);
    if (minha) { setDraft((cur) => cur || minha.text); setSendError("A mensagem esperou mais de uma hora sem conexão e não foi enviada."); }
  }, [fila, sel, VALIDADE_MS]);

  // Envio MANUAL da equipe (texto livre) pelo painel. Otimista: mostra a bolha na hora e
  // reconcilia com a mensagem real do servidor (dedup por id no polling). aiGenerated=false
  // → o backend aciona o takeover e pausa o bot.
  //
  // FILA: quando a rede falha, a mensagem NÃO volta para a caixa de texto — fica
  // guardada e sai sozinha quando a conexão voltar, como no aplicativo. Cada item
  // carrega uma CHAVE, e o servidor recusa a segunda vez que ela aparece: sem
  // isso, um reenvio de uma tentativa que na verdade chegou mandaria a mesma
  // mensagem duas vezes para o WhatsApp de uma pessoa.
  //
  // Erro do SERVIDOR (janela de 24h fechada, sem permissão) não entra na fila:
  // insistir não resolveria e a mensagem ficaria voltando para sempre. Aí sim o
  // texto volta para a caixa, com o motivo na tela.
  async function send() {
    const text = draft.trim();
    if (!sel || !text || sending || !conv?.windowOpen) return;
    setSending(true); setSendError(null);
    const optId = "opt-" + Date.now();
    const chave = `${optId}-${Math.random().toString(36).slice(2, 10)}`;
    const optimistic: Msg = { id: optId, text, direction: "out", type: "text", timestamp: new Date().toISOString(), aiGenerated: false, pending: true };
    nearBottomRef.current = true;
    setConv((c) => (c ? { ...c, items: [...c.items, optimistic] } : c));
    setDraft("");
    if (taRef.current) taRef.current.style.height = "auto";
    try {
      gravarRascunho(sel, ""); // saiu do compositor: o rascunho morreu aqui
      const r = await fetch(`/api/portal/${token}/conversations/${sel}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, key: chave }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        // O servidor respondeu e recusou: insistir não muda nada.
        setConv((c) => (c ? { ...c, items: c.items.filter((m) => m.id !== optId) } : c));
        setDraft((cur) => cur || text); // devolve o texto pra não perder o que digitou
        setSendError(d?.error || "Não foi possível enviar a mensagem.");
        return;
      }
      if (!d?.message) {
        // `duplicada: true` — uma tentativa anterior já entregou. A bolha
        // otimista sai e o polling traz a real; não há nada a reenviar.
        setConv((c) => (c ? { ...c, items: c.items.filter((m) => m.id !== optId) } : c));
        return;
      }
      // reconcilia a otimista pela mensagem real (id do banco → polling não duplica)
      setConv((c) => (c ? { ...c, items: c.items.map((m) => (m.id === optId ? (d.message as Msg) : m)) } : c));
    } catch {
      // Falha de REDE: a mensagem fica na fila com a bolha em cinza na tela, e
      // sai sozinha quando a conexão voltar.
      enfileirar({ id: optId, chave, contactId: sel, text, tentativas: 0, criadoEm: Date.now() });
    } finally { setSending(false); }
  }

  /**
   * "A IA errou aqui". Até agora, AiCorrection só nascia quando alguém REJEITAVA
   * um orçamento — o aprendizado enxergava erro de preço e mais nada. Quem vê a
   * IA errar em tempo real é a vendedora, dentro da conversa. Mesma rota do
   * aplicativo; o servidor busca o texto da IA e a pergunta do lead.
   */
  async function corrigirIA(messageId: string) {
    const nota = window.prompt(
      "O que a IA deveria ter respondido?\n\nIsso vai para a fila de aprendizado da Veloce — o lead não recebe nada.",
    );
    if (!nota || !nota.trim() || !sel) return;
    const r = await fetch(`/api/portal/${token}/conversations/${sel}/correction`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, note: nota.trim() }),
    }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (!r?.ok) { alert(d?.error || "Não foi possível registrar."); return; }
    alert("Obrigado. A correção foi registrada.");
  }

  /**
   * Arquivar tira da caixa SEM apagar nada, e some para a equipe inteira — o
   * estado mora no servidor, como no aplicativo. É o que permite a JR encarar
   * 1.271 conversas: o que já morreu sai da frente.
   */
  /**
   * Assumir em LOTE as conversas LIVRES que estão na tela. A JR abriu com ~1.250
   * sem dona: pegar uma a uma não é trabalho, é desistência. O filtro é a
   * seleção — por isso o aviso diz o número exato antes de agir.
   *
   * O servidor ignora em silêncio o que já tem outra responsável e devolve a
   * contagem; dizer isso evita a vendedora achar que pegou conversa alheia.
   */
  const [assumindoLote, setAssumindoLote] = useState(false);
  // Teto de 100 por chamada é regra do SERVIDOR; a tela mostra o mesmo número
  // que vai agir, para o aviso não prometer mais do que acontece.
  const livresNaTela = Math.min(100, items.filter((c) => !c.assignedEmail).length);
  async function assumirLote() {
    const livres = items.filter((c) => !c.assignedEmail).slice(0, 100);
    if (livres.length === 0 || assumindoLote) return;
    if (!window.confirm(`Assumir ${livres.length} conversa${livres.length > 1 ? "s" : ""}?\n\nVocê passa a ser a responsável por todas elas.`)) return;
    setAssumindoLote(true);
    try {
      const r = await fetch(`/api/portal/${token}/conversations/bulk-assign`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: livres.map((c) => c.contactId) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { alert(d?.error || "Não foi possível assumir agora."); return; }
      setList((l) => (l ? l.map((row) => (livres.some((x) => x.contactId === row.contactId) ? { ...row, assignedEmail: me ?? row.assignedEmail } : row)) : l));
      alert(`${d.assumidas} assumida${d.assumidas === 1 ? "" : "s"}.${d.ignoradas > 0 ? ` ${d.ignoradas} já tinham outra responsável.` : ""}`);
    } finally { setAssumindoLote(false); }
  }

  // ── Catálogo no meio do atendimento ───────────────────────────────────────
  // A vendedora precisava sair da conversa (ou abrir o site) para consultar
  // preço. O aplicativo trouxe o catálogo para dentro da conversa; aqui vai o
  // mesmo, pela MESMA rota somente-leitura (/catalog).
  const [catalogoAberto, setCatalogoAberto] = useState(false);
  const [catalogoBusca, setCatalogoBusca] = useState("");
  const [catalogo, setCatalogo] = useState<{ id: string; title: string; price: number | null; imageUrl: string | null }[] | null>(null);
  const [enviandoItem, setEnviandoItem] = useState<string | null>(null);

  useEffect(() => {
    if (!catalogoAberto) return;
    let vivo = true;
    const sp = catalogoBusca.trim() ? `?q=${encodeURIComponent(catalogoBusca.trim())}` : "";
    // Debounce curto: digitar "churrasqueira" não vale doze consultas.
    const id = setTimeout(() => {
      fetch(`/api/portal/${token}/catalog${sp}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (vivo) setCatalogo(Array.isArray(d?.items) ? d.items : []); })
        .catch(() => { if (vivo) setCatalogo([]); });
    }, 220);
    return () => { vivo = false; clearTimeout(id); };
  }, [catalogoAberto, catalogoBusca, token]);

  const precoBR = (v: number | null) =>
    v == null ? "" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  /** Insere o item no compositor, para a vendedora completar antes de mandar. */
  function inserirItem(it: { title: string; price: number | null }) {
    const linha = it.price != null ? `${it.title} — ${precoBR(it.price)}` : it.title;
    setDraft((d) => (d.trim() ? `${d.trim()}\n${linha}` : linha));
    setCatalogoAberto(false);
    taRef.current?.focus();
  }

  /**
   * Manda a FOTO com o nome e o preço na legenda — que é o que o lead quer ver.
   * A imagem do catálogo pode estar em outro domínio; se o navegador barrar,
   * dizemos isso em vez de falhar em silêncio, e o texto ainda pode ser inserido.
   */
  async function enviarItemComFoto(it: { id: string; title: string; price: number | null; imageUrl: string | null }) {
    if (!it.imageUrl || !sel || enviandoItem) return;
    setEnviandoItem(it.id);
    try {
      const resp = await fetch(it.imageUrl);
      if (!resp.ok) throw new Error("imagem indisponível");
      const blob = await resp.blob();
      const nome = `catalogo-${it.id}.jpg`;
      const legenda = it.price != null ? `${it.title} — ${precoBR(it.price)}` : it.title;
      await sendMedia("image", new File([blob], nome, { type: blob.type || "image/jpeg" }), legenda);
      setCatalogoAberto(false);
    } catch {
      alert("Não foi possível baixar a foto deste item. Use “inserir texto” e envie a imagem manualmente.");
    } finally { setEnviandoItem(null); }
  }

  const [arquivando, setArquivando] = useState(false);
  async function arquivar(arquivada: boolean) {
    if (!sel || arquivando) return;
    setArquivando(true);
    try {
      const r = await fetch(`/api/portal/${token}/conversations/${sel}/state`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ arquivada }),
      });
      if (!r.ok) { alert("Não foi possível arquivar agora."); return; }
      // Sai da lista na hora: esperar o polling faria a linha ficar piscando.
      setList((l) => (l ? l.filter((row) => row.contactId !== sel) : l));
      setSel(null);
    } finally { setArquivando(false); }
  }

  // Assumir/transferir/remover o dono do lead (atribuição).
  async function assign(email: string | null) {
    if (!sel || assigning) return;
    setAssigning(true); setOwnerMenu(false);
    try {
      const r = await fetch(`/api/portal/${token}/conversations/${sel}/assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { alert(d.error || "Não foi possível atualizar o dono."); return; }
      const ae = d.assignedEmail ?? null;
      setConv((c) => (c ? { ...c, assignedEmail: ae, assignedName: ae ? (attendants.find((a) => a.email === ae)?.name || ae.split("@")[0]) : null } : c));
      // reflete na lista sem esperar o polling
      setList((l) => (l ? l.map((row) => (row.contactId === sel ? { ...row, assignedEmail: ae } : row)) : l));
    } finally { setAssigning(false); }
  }

  // Muda a etapa do funil manualmente. Trava (funnelManual=true no backend) pra o
  // classificador automático não desfazer. Reflete na conversa e na lista na hora.
  async function changeStage(stage: string) {
    if (!sel || stageSaving) return;
    setStageSaving(true); setStageMenu(false);
    try {
      const r = await fetch(`/api/portal/${token}/funnel/${sel}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { alert(d.error || "Não foi possível atualizar a etapa."); return; }
      setConv((c) => (c ? { ...c, funnelStage: stage, funnelEvidence: null } : c));
      setList((l) => (l ? l.map((row) => (row.contactId === sel ? { ...row, funnelStage: stage } : row)) : l));
    } finally { setStageSaving(false); }
  }

  // Aplica/remove uma etiqueta na conversa aberta (otimista — reflete na conversa e na lista).
  async function toggleTag(tag: { id: string; name: string; color: string }) {
    if (!sel) return;
    const has = (conv?.tags ?? []).some((t) => t.id === tag.id);
    const upd = (tags?: { id: string; name: string; color: string }[]) => (has ? (tags ?? []).filter((t) => t.id !== tag.id) : [...(tags ?? []), tag]);
    setConv((c) => (c ? { ...c, tags: upd(c.tags) } : c));
    setList((l) => (l ? l.map((row) => (row.contactId === sel ? { ...row, tags: upd(row.tags) } : row)) : l));
    try {
      await fetch(`/api/portal/${token}/conversations/${sel}/tags${has ? `?tagId=${tag.id}` : ""}`, {
        method: has ? "DELETE" : "POST", headers: { "Content-Type": "application/json" },
        body: has ? undefined : JSON.stringify({ tagId: tag.id }),
      });
    } catch { /* o polling reconcilia */ }
  }

  // Cria uma etiqueta nova (cor rotativa) e já aplica na conversa.
  async function createAndApplyTag(name: string) {
    const nm = name.trim(); if (!nm || !sel) return;
    const color = TAG_COLORS[allTags.length % TAG_COLORS.length];
    try {
      const r = await fetch(`/api/portal/${token}/tags`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nm, color }) });
      const tag = await r.json().catch(() => null);
      if (!r.ok || !tag?.id) { alert(tag?.error || "Não foi possível criar a etiqueta."); return; }
      setAllTags((ts) => (ts.some((t) => t.id === tag.id) ? ts : [...ts, tag].sort((a, b) => a.name.localeCompare(b.name))));
      await toggleTag(tag);
    } catch { /* ignora */ }
  }

  // Envio de MÍDIA (imagem/documento/áudio) — otimista + reconcile como o texto.
  async function sendMedia(kind: "image" | "audio" | "document", file: File, caption?: string) {
    if (!sel || sending || !conv?.windowOpen) return;
    setSending(true); setSendError(null);
    const optId = "opt-" + Date.now();
    const optimistic: Msg = { id: optId, text: caption || (kind === "document" ? file.name : null) || null, direction: "out", type: kind, timestamp: new Date().toISOString(), aiGenerated: false, pending: true };
    nearBottomRef.current = true;
    setConv((c) => (c ? { ...c, items: [...c.items, optimistic] } : c));
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      if (caption) fd.append("caption", caption);
      const r = await fetch(`/api/portal/${token}/conversations/${sel}/send-media`, { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.message) {
        setConv((c) => (c ? { ...c, items: c.items.filter((m) => m.id !== optId) } : c));
        setSendError(d?.error || "Não foi possível enviar o arquivo.");
        return;
      }
      setConv((c) => (c ? { ...c, items: c.items.map((m) => (m.id === optId ? (d.message as Msg) : m)) } : c));
    } catch {
      setConv((c) => (c ? { ...c, items: c.items.filter((m) => m.id !== optId) } : c));
      setSendError("Falha de conexão ao enviar o arquivo.");
    } finally { setSending(false); }
  }

  const onPickFile = (kind: "image" | "document") => (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    // Abre a pré-visualização (confirmar + legenda) em vez de enviar direto.
    setMediaCaption("");
    setPendingMedia({ kind, file: f, url: kind === "image" ? URL.createObjectURL(f) : null });
  };

  // Confirma o envio da mídia pré-visualizada (com a legenda digitada).
  function confirmSendMedia() {
    if (!pendingMedia) return;
    const { kind, file, url } = pendingMedia;
    const cap = mediaCaption.trim() || undefined;
    if (url) URL.revokeObjectURL(url);
    setPendingMedia(null); setMediaCaption("");
    void sendMedia(kind, file, cap);
  }
  function cancelPendingMedia() {
    if (pendingMedia?.url) URL.revokeObjectURL(pendingMedia.url);
    setPendingMedia(null); setMediaCaption("");
  }

  // Gravação de áudio (voz) — MediaRecorder. iOS grava em audio/mp4 (aceito pela Cloud API).
  const pickAudioMime = (): string => {
    for (const c of ["audio/mp4", "audio/aac", "audio/mpeg", "audio/ogg;codecs=opus"]) {
      try { if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c; } catch { /* ignore */ }
    }
    return "";
  };
  function cleanupRec() {
    const r = recRef.current;
    if (r) { clearInterval(r.timer); r.stream.getTracks().forEach((t) => t.stop()); }
    recRef.current = null;
    setRecording(false); setRecSecs(0);
  }
  async function startRecording() {
    if (recording || sending || !sel || !conv?.windowOpen) return;
    setSendError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickAudioMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      mr.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
      const timer = setInterval(() => setRecSecs((s) => s + 1), 1000);
      recRef.current = { mr, chunks, stream, mime: mr.mimeType || mime || "audio/mp4", timer };
      setRecSecs(0); setRecording(true);
      mr.start();
    } catch { setSendError("Não consegui acessar o microfone — verifique a permissão."); }
  }
  function cancelRecording() {
    const r = recRef.current;
    if (r) { try { r.mr.stop(); } catch { /* ignore */ } }
    cleanupRec();
  }
  function stopAndSendRecording() {
    const r = recRef.current;
    if (!r) return;
    const { mr, chunks, mime } = r;
    mr.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      cleanupRec();
      if (blob.size > 0) {
        const base = mime.split(";")[0];
        const ext = base.includes("mp4") ? "m4a" : base.includes("ogg") ? "ogg" : base.includes("mpeg") ? "mp3" : "m4a";
        void sendMedia("audio", new File([blob], `audio.${ext}`, { type: base }));
      }
    };
    try { mr.stop(); } catch { cleanupRec(); }
  }
  // Encerra o microfone se sair no meio da gravação.
  useEffect(() => () => { const r = recRef.current; if (r) { clearInterval(r.timer); r.stream.getTracks().forEach((t) => t.stop()); } }, []);

  const onComposerKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
  };
  const onComposerInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    if (sel) gravarRascunho(sel, e.target.value); // sobrevive a trocar de conversa e a recarregar
    const el = e.target; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  // IA pausada: a última mensagem de saída foi da EQUIPE (humano) → o bot está em takeover.
  const iaPaused = (() => {
    for (let i = (conv?.items.length ?? 0) - 1; i >= 0; i--) {
      const m = conv!.items[i];
      if (m.direction === "out") return m.aiGenerated === false;
    }
    return false;
  })();

  const tabChip = (k: "all" | "ads" | "waiting" | "arquivadas", label: string) => {
    const on = tab === k;
    const isWait = k === "waiting";
    return (
      // `flexShrink: 0` — a barra ROLA na horizontal, então o chip não pode
      // encolher: sem isto os rótulos se espremem uns contra os outros em vez de
      // sair de vista, e o mais longo ("Arquivadas") é o que mais sofre.
      // O separador ao lado já tinha; os chips não.
      <button onClick={() => { setTab(k); if (k !== "ads") setAdFilter(null); }} style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, padding: "5px 13px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, borderRadius: 20, background: on ? (isWait ? "color-mix(in srgb, #1FA855 15%, transparent)" : "var(--p-accent-soft)") : "transparent", color: on ? (isWait ? "#1FA855" : "var(--p-accent)") : "var(--wa-muted)" }}>
        {isWait && <span style={{ width: 7, height: 7, borderRadius: "50%", background: on ? "#1FA855" : "var(--wa-muted)" }} />}
        {label}
        {isWait && waitingCount > 0 && <span style={{ fontSize: 11, fontWeight: 800 }}>{waitingCount}</span>}
      </button>
    );
  };

  // Item da barra flutuante inferior (mobile, estilo WhatsApp): ícone + rótulo, ativo destacado.
  const bottomLink = (href: string, label: string, icon: React.ReactNode, badge = 0) => (
    <Link key={label} href={href} prefetch style={{ flex: 1, textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "7px 4px", borderRadius: 16, color: "var(--wa-muted)", transition: "color .2s ease, background .2s ease" }}>
      <span style={{ position: "relative", display: "inline-flex", opacity: 0.75 }}>
        {icon}
        {badge > 0 && <span style={{ position: "absolute", top: -5, right: -10, minWidth: 15, height: 15, padding: "0 4px", borderRadius: 8, background: "#1FA855", color: "#fff", fontSize: 9.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>{badge > 99 ? "99+" : badge}</span>}
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: "-0.01em" }}>{label}</span>
    </Link>
  );

  return (
    <div className="cdesk" style={{ flexDirection: "column", height: "100dvh", width: "100%" }}>
      <style>{`@keyframes portalRecBlink{50%{opacity:.2}}@keyframes portalSheetUp{from{transform:translateY(100%)}to{transform:none}}.psheet{animation:portalSheetUp .28s cubic-bezier(.22,1,.36,1) both}@media (prefers-reduced-motion:reduce){.psheet{animation:none}}.pc-corrigir{opacity:1}@media (hover:hover){.pc-corrigir{opacity:0}[data-bolha]:hover .pc-corrigir,.pc-corrigir:focus-visible{opacity:1}}`}</style>
      {/* Topbar full-width — mantém a identidade do painel. No mobile some quando a thread abre (a thread tem header próprio com voltar). */}
      <header style={{ display: isMobile ? "none" : "flex", alignItems: "center", gap: 12, padding: isMobile ? "calc(12px + env(safe-area-inset-top)) 16px 12px" : "10px 20px", borderBottom: "1px solid var(--p-border)", background: "var(--p-surface)", flexShrink: 0 }}>
        <div style={{ fontSize: isMobile ? 18 : 15, fontWeight: 800, color: "var(--p-text)", letterSpacing: "-0.01em" }}>Conversas dos leads</div>
        <button onClick={toggleTheme} title={theme === "dark" ? "Tema claro" : "Tema escuro"} aria-label="Alternar tema claro/escuro"
          style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 10, border: "1px solid var(--p-border)", background: "var(--p-bg)", color: "var(--wa-muted)", cursor: "pointer", flexShrink: 0 }}>
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        {/* Sair / trocar de conta — no mobile (no desktop o "Sair" fica na sidebar do painel). */}
        {isMobile && me && (
          <button onClick={logout} title="Sair da conta" aria-label="Sair da conta"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: 10, border: "1px solid var(--p-border)", background: "var(--p-bg)", color: "var(--wa-muted)", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
            <LogOut size={16} /> Sair
          </button>
        )}
      </header>

      {/* Viewer preenche toda a área interna (ao lado da sidebar do shell) */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
      <div style={{ width: "100%", height: "100%", display: "flex", minHeight: 0, overflow: "hidden", borderTop: "1px solid var(--p-border)" }}>
      {/* ── Lista (sidebar) ── */}
      <aside style={{ width: isMobile ? "100%" : 400, flexShrink: 0, display: isMobile && sel ? "none" : "flex", flexDirection: "column", borderRight: isMobile ? "none" : "1px solid var(--p-border)", background: "var(--p-surface)" }}>
        {/* busca */}
        <div style={{ padding: isMobile ? "10px 14px" : "8px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: isMobile ? 46 : 38, padding: "0 12px", borderRadius: 12, background: "var(--p-bg)", border: "1px solid var(--p-border)" }}>
            <Search size={15} style={{ color: "var(--wa-muted)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar por nome ou número" style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--p-text)", fontSize: isMobile ? 16 : 13.5 }} />
          </div>
        </div>
        {/* FAIXA DE FILTROS — uma linha só, que ROLA na horizontal.
            Antes era `flexWrap: wrap` com um botão em `marginLeft: auto`: as
            quatro abas quebravam em duas linhas e o botão caía numa terceira,
            sozinho. Com a busca e o "Meus leads" acima, viravam cinco faixas
            empilhadas antes da primeira conversa. Agora é UMA, e o que não cabe
            se alcança arrastando — como as abas do WhatsApp.

            Dois eixos diferentes na mesma linha (estado da conversa e dono),
            separados por um traço para não parecerem a mesma escolha. */}
        {(
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: isMobile ? "0 14px 10px" : "0 12px 9px", overflowX: "auto", scrollbarWidth: "none", whiteSpace: "nowrap" }}>
            {tabChip("all", "Conversas")}
            {hasAds && tabChip("ads", "Anúncio")}
            {tabChip("arquivadas", "Arquivadas")}
            {me && attendants.length > 1 && (
              <>
                <span aria-hidden style={{ width: 1, height: 18, background: "var(--p-border)", margin: "0 3px", flexShrink: 0 }} />
                <button onClick={() => setMineOnly((v) => !v)} aria-pressed={mineOnly}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", border: "none", borderRadius: 20, cursor: "pointer", fontSize: 13, fontWeight: 600, flexShrink: 0, background: mineOnly ? "var(--p-accent-soft)" : "transparent", color: mineOnly ? "var(--p-accent)" : "var(--wa-muted)" }}>
                  <UserRound size={13} /> Meus
                  {myWaiting > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: "#1FA855" }}>{myWaiting}</span>}
                </button>
              </>
            )}
          </div>
        )}

        {/* RECORTE ATIVO — a caixa está mostrando um pedaço, e precisa dizer.
            Sem esta faixa, a gestora chega da tela de Equipe, vê 12 conversas
            onde havia 42 e conclui que perdeu conversas. E a saída fica aqui,
            porque tirar o filtro pela URL não é uma opção que exista para ela. */}
        {(estadoFiltro || donoFiltro) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "0 14px 10px" : "0 12px 9px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, flex: 1, minWidth: 0, padding: "7px 12px", borderRadius: 10, background: "var(--p-accent-soft)", color: "var(--p-accent)", fontSize: 12.5, fontWeight: 600 }}>
              <Search size={13} style={{ flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {estadoFiltro === "sem-resposta" ? "Sem nenhuma resposta"
                  : estadoFiltro === "aguardando" ? "Aguardando resposta"
                  : "Filtrado"}
                {donoFiltro && ` · ${attendants.find((a) => a.email === donoFiltro)?.name
                  ?? conexoes.find((c) => c.id === conexaoFiltro)?.nome
                  ?? donoFiltro.split("@")[0]}`}
              </span>
            </span>
            <Link href={`/r/${token}/conversas`} prefetch
              style={{ flexShrink: 0, padding: "7px 12px", borderRadius: 10, border: "1px solid var(--p-border)", background: "var(--p-surface)", color: "var(--wa-muted)", fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}>
              Ver todas
            </Link>
          </div>
        )}

        {/* AÇÃO DE LOTE — faixa contextual, largura inteira, logo acima da lista.
            Como chip solto na linha das abas ela competia com os filtros e
            parecia mais um deles; aqui ela é o que é: uma ação sobre o que está
            na tela, que só aparece quando há o que assumir. */}
        {me && !somenteLeitura && livresNaTela > 0 && (
          <button onClick={() => void assumirLote()} disabled={assumindoLote}
            title="Assumir as conversas sem responsável que estão nesta lista"
            style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", padding: "8px 14px", border: "none", borderTop: "1px solid var(--p-border)", background: "color-mix(in srgb, var(--p-accent) 6%, transparent)", color: "var(--p-accent)", fontSize: 12.5, fontWeight: 700, cursor: assumindoLote ? "wait" : "pointer", textAlign: "left" }}>
            <UserRound size={14} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>
              {assumindoLote ? "assumindo…" : `${livresNaTela} sem responsável nesta lista`}
            </span>
            {!assumindoLote && <span style={{ fontWeight: 800 }}>Assumir →</span>}
          </button>
        )}
        {/* CAMPANHA — antes era uma barra de chips que rolava para o lado: com
            várias campanhas, os nomes ficavam cortados e era preciso arrastar
            para descobrir o que existia. No aplicativo isso é uma folha que
            abre com a lista inteira, e é o que vale aqui: um botão diz a
            campanha atual, e o modal mostra todas com suas contagens. */}
        {tab === "ads" && adGroups.length > 0 && (
          <div style={{ padding: "0 12px 9px", borderBottom: "1px solid var(--p-border)" }}>
            <button onClick={() => setCampanhaModal(true)}
              style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", height: 34, padding: "0 12px", borderRadius: 10, border: `1px solid ${adFilter ? "var(--p-accent)" : "var(--p-border)"}`, background: adFilter ? "var(--p-accent-soft)" : "var(--p-bg)", color: adFilter ? "var(--p-accent)" : "var(--p-text)", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
              <Megaphone size={14} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {adFilter ?? "Todas as campanhas"}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--wa-muted)", flexShrink: 0 }}>
                {adFilter ? (adGroups.find((g) => g.label === adFilter)?.count ?? 0) : adGroups.reduce((n, g) => n + g.count, 0)}
              </span>
              <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
            </button>
          </div>
        )}

        {campanhaModal && (
          <>
            <div onClick={() => setCampanhaModal(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.35)" }} />
            <div role="dialog" aria-label="Escolher campanha" className={isMobile ? "psheet" : undefined}
              style={isMobile
                ? { position: "fixed", zIndex: 61, left: 0, right: 0, bottom: 0, maxHeight: "76vh", display: "flex", flexDirection: "column", background: "var(--p-surface)", borderTop: "1px solid var(--p-border)", borderRadius: "18px 18px 0 0", boxShadow: "0 -12px 40px rgba(0,0,0,.22)", overflow: "hidden", paddingBottom: "env(safe-area-inset-bottom)" }
                : { position: "fixed", zIndex: 61, left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "min(420px, calc(100vw - 32px))", maxHeight: "70vh", display: "flex", flexDirection: "column", background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,.28)", overflow: "hidden" }}>
              {isMobile && (
                <div aria-hidden style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
                  <span style={{ width: 38, height: 4, borderRadius: 2, background: "var(--p-border)" }} />
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 16px", borderBottom: "1px solid var(--p-border)" }}>
                <Megaphone size={16} style={{ color: "var(--p-accent)" }} />
                <strong style={{ flex: 1, fontSize: 14.5, color: "var(--p-text)" }}>Campanhas</strong>
                <button onClick={() => setCampanhaModal(false)} aria-label="Fechar" style={{ display: "inline-flex", border: "none", background: "transparent", color: "var(--wa-muted)", cursor: "pointer", padding: 4 }}>
                  <X size={16} />
                </button>
              </div>
              <div style={{ overflowY: "auto", padding: 6 }}>
                {[{ label: null as string | null, nome: "Todas as campanhas", count: adGroups.reduce((n, g) => n + g.count, 0) },
                  ...adGroups.map((g) => ({ label: g.label as string | null, nome: g.label, count: g.count }))].map((op) => {
                  const on = adFilter === op.label;
                  return (
                    <button key={op.nome} onClick={() => { setAdFilter(op.label); setCampanhaModal(false); }}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", border: "none", borderRadius: 10, background: on ? "var(--p-accent-soft)" : "transparent", color: on ? "var(--p-accent)" : "var(--p-text)", fontSize: 13.5, fontWeight: on ? 700 : 500, cursor: "pointer", textAlign: "left" }}>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{op.nome}</span>
                      <span className="tnum" style={{ fontSize: 12, fontWeight: 700, color: on ? "var(--p-accent)" : "var(--wa-muted)" }}>{op.count}</span>
                      {on && <Check size={15} style={{ flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
        {(tab !== "ads" || adGroups.length === 0) && <div style={{ borderBottom: "1px solid var(--p-border)" }} />}
        {/* rows */}
        {/* O espaço reservado para a barra só existe enquanto ela existe: dentro
            da conversa ela some, e manter o vão deixaria uma faixa morta acima
            do compositor. */}
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: temBarra && !(isMobile && sel) ? "calc(96px + env(safe-area-inset-bottom))" : 0 }}>
          {list === null ? <p style={{ padding: 16, fontSize: 13, color: "var(--wa-muted)", lineHeight: 1.5 }}>
              {semRede ? "Sem conexão — as conversas aparecem assim que o sinal voltar." : "Carregando…"}
            </p>
            : items.length === 0 && !hasMore ? <p style={{ padding: 16, fontSize: 13, color: "var(--wa-muted)", lineHeight: 1.5 }}>{
                q ? "Nada encontrado."
                : estadoFiltro === "sem-resposta" ? "Nenhuma conversa sem resposta aqui — todas já foram atendidas."
                : estadoFiltro === "aguardando" ? "Ninguém aguardando resposta neste recorte."
                : donoFiltro ? "Nenhuma conversa desta pessoa."
                : tab === "ads" ? "Nenhum lead de anúncio."
                : "Nenhuma conversa."}</p>
            : items.map((c) => {
              const on = sel === c.contactId;
              // DOIS SINAIS DIFERENTES, e confundi-los seria um erro de negócio:
              //   `waiting`  — o lead falou por último e NINGUÉM respondeu. Ler
              //                não é responder: continua esperando depois de aberta.
              //   `naoLida`  — ninguém da equipe ABRIU ainda. Some quando a
              //                colega abre, no app ou aqui, porque o estado mora
              //                no servidor (três vendedoras, um número só).
              const waiting = isWaiting(c);
              const naoLida = waiting && c.lida !== true;
              // HÁ QUANTO TEMPO espera, não só QUE espera. Com 1.257 aguardando,
              // é o que separa "tenho mil conversas" de "estas cinco estão me
              // custando venda". Igual ao aplicativo, pela mesma função.
              const desde = esperandoDesde(c.lastInboundAt, c.lastOutboundAt);
              const urgencia = urgenciaDe(desde, agora);
              const corEspera = corDaUrgencia(urgencia);
              return (
                <button key={c.contactId} onClick={() => setSel(c.contactId)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: isMobile ? "13px 16px" : "10px 14px", border: "none", borderBottom: "1px solid var(--p-border)", borderLeft: on ? "3px solid var(--p-accent)" : waiting ? `3px solid ${corEspera}` : "3px solid transparent", background: on ? "var(--p-accent-soft)" : naoLida ? `color-mix(in srgb, ${corEspera} 6%, transparent)` : "transparent", cursor: "pointer" }}>
                  <Avatar name={c.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14.5, fontWeight: naoLida ? 800 : 600, color: "var(--p-text)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                      {!nameIsNumber(c.name, c.waId) && formatPhoneShort(c.waId) && (
                        <span style={{ fontSize: 11.5, color: "var(--wa-muted)", whiteSpace: "nowrap", flexShrink: 0 }}>{formatPhoneShort(c.waId)}</span>
                      )}
                      <span title={waiting && desde ? "Esperando resposta há " + rotuloEspera(desde, agora) : undefined} style={{ fontSize: 11, fontWeight: waiting ? 800 : 400, color: waiting ? corEspera : "var(--wa-muted)", whiteSpace: "nowrap" }}>{waiting && desde ? rotuloEspera(desde, agora) : listTime(c.lastMessageAt)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: 12.5, fontWeight: naoLida ? 700 : 400, color: naoLida ? "var(--p-text)" : "var(--wa-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.lastDirection === "out" ? "✓✓ " : ""}{preview(c.lastText, c.lastType)}</span>
                      {naoLida && <span title="Ninguém da equipe abriu ainda" style={{ width: 9, height: 9, borderRadius: "50%", background: corEspera, boxShadow: `0 0 0 3px color-mix(in srgb, ${corEspera} 18%, transparent)`, flexShrink: 0 }} />}
                      {c.fromAd && (c.adStrong
                        ? <span title="Clicou no anúncio (Click-to-WhatsApp)" style={{ fontSize: 9, fontWeight: 800, color: "var(--p-accent)", background: "var(--p-accent-soft)", padding: "1px 6px", borderRadius: 20, letterSpacing: 0.3 }}>ADS</span>
                        : <span title="Menção ao anúncio (detectado pelo texto, sem clique)" style={{ fontSize: 9, fontWeight: 700, color: "var(--wa-muted)", background: "color-mix(in srgb, var(--wa-muted) 14%, transparent)", padding: "1px 6px", borderRadius: 20, letterSpacing: 0.3 }}>menção</span>
                      )}
                      <StageBadge stage={c.funnelStage} />
                      {/* DE QUAL NÚMERO veio. Só aparece quando há mais de um e
                          nenhum filtro está ativo — com filtro, repetir o número
                          em toda linha seria eco do que a aba já diz. */}
                      {conexoes.length > 1 && !conexaoFiltro && c.conexaoNome && (
                        <span title={`Chegou no número ${c.conexaoNome}`} style={{ fontSize: 9, fontWeight: 700, color: "var(--wa-muted)", background: "color-mix(in srgb, var(--wa-muted) 12%, transparent)", padding: "1px 6px", borderRadius: 20, whiteSpace: "nowrap", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>{c.conexaoNome}</span>
                      )}
                      {(c.tags ?? []).map((t) => (
                        <span key={t.id} title={t.name} style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: t.color, padding: "1px 6px", borderRadius: 20, letterSpacing: 0.2, whiteSpace: "nowrap", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0 }}>{t.name}</span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          {!!list && hasMore && (
            <div style={{ padding: "12px 16px 18px", textAlign: "center" }}>
              <button onClick={loadMore} disabled={loadingMore}
                style={{ fontSize: 12.5, fontWeight: 600, color: "var(--p-accent)", background: "transparent", border: "1px solid var(--p-border)", borderRadius: 8, padding: "8px 18px", cursor: loadingMore ? "default" : "pointer", opacity: loadingMore ? 0.6 : 1 }}>
                {loadingMore ? "Carregando…" : "Carregar mais"}
              </button>
            </div>
          )}
        </div>

      </aside>

      {/* ── Chat ── */}
      <main style={{ flex: 1, display: isMobile && !sel ? "none" : "flex", flexDirection: "column", minWidth: 0, position: "relative", background: "var(--wa-chat)" }}>
        {/* marca d'água: logo do PRÓPRIO cliente (via prop logoUrl; some se não tiver) */}
        {chatWatermark && <div style={{ position: "absolute", inset: 0, backgroundImage: `url("${chatWatermark}")`, backgroundRepeat: "no-repeat", backgroundPosition: "center", backgroundSize: "min(48%, 420px)", opacity: 0.06, pointerEvents: "none", zIndex: 0 }} />}
        {/* granulado (feTurbulence) — mesmo grão do tema claro */}
        <div style={{ position: "absolute", inset: 0, opacity: 0.04, pointerEvents: "none", zIndex: 0, mixBlendMode: "multiply",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E")` }} />
        <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {!sel ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--wa-muted)" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "color-mix(in srgb, var(--p-accent) 14%, transparent)", display: "flex", alignItems: "center", justifyContent: "center" }}><Eye size={30} style={{ color: "var(--p-accent)" }} /></div>
            <p style={{ fontSize: 14 }}>Selecione uma conversa para ver o histórico</p>
          </div>
        ) : loadingConv || !conv ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--wa-muted)", fontSize: 13, padding: 20, textAlign: "center", lineHeight: 1.5 }}>
            {semRede ? "Sem conexão — a conversa abre assim que o sinal voltar." : "Carregando…"}
          </div>
        ) : (
          <>
            {/* header do chat */}
            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 12, padding: isMobile ? "calc(8px + env(safe-area-inset-top)) 12px 9px" : "9px 18px", background: "var(--p-surface)", borderBottom: "1px solid var(--p-border)", flexShrink: 0 }}>
              {/* Identidade — quem é (hierarquia clara, estilo WhatsApp) */}
              <div style={{ display: "flex", alignItems: "center", gap: 11, flex: 1, minWidth: 0 }}>
                {isMobile && (
                  <button onClick={() => setSel(null)} aria-label="Voltar para a lista" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, marginLeft: -6, borderRadius: 10, border: "none", background: "transparent", color: "var(--p-text)", cursor: "pointer", flexShrink: 0 }}>
                    <ArrowLeft size={22} />
                  </button>
                )}
                <Avatar name={conv.contact.name} size={isMobile ? 42 : 40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: isMobile ? 16 : 14.5, fontWeight: 700, color: "var(--p-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.25 }}>{conv.contact.name}</div>
                  {(() => { const wa = list?.find((r) => r.contactId === sel)?.waId ?? ""; const ph = formatPhone(wa); return ph && !nameIsNumber(conv.contact.name, wa) ? <div style={{ fontSize: 12, color: "var(--wa-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ph}</div> : null; })()}
                  {conv.lead?.adTitle && <div title={conv.lead.adStrong ? "Clicou no anúncio (Click-to-WhatsApp)" : "Menção ao anúncio: a IA identificou pelo TEXTO da mensagem, sem clique."} style={{ fontSize: 11.5, color: "var(--wa-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.lead.adStrong ? `veio do anúncio “${conv.lead.adTitle}”` : `mencionou o anúncio “${conv.lead.adModel ?? conv.lead.adTitle}”`}</div>}
                </div>
              </div>
              {/* Ações do topo — ETIQUETA, DONO e ARQUIVAR (topo limpo, estilo WhatsApp). IA e etapa flutuam abaixo. */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => setBuscaAberta((v) => !v)}
                title="Buscar nesta conversa"
                aria-label="Buscar nesta conversa"
                aria-expanded={buscaAberta}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 999, border: "1px solid var(--p-border)", background: buscaAberta ? "var(--p-accent-soft)" : "var(--p-surface)", color: buscaAberta ? "var(--p-accent)" : "var(--wa-muted)", cursor: "pointer", flexShrink: 0, boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
                <Search size={14} />
              </button>
              {!somenteLeitura && <button
                onClick={() => void marcarNaoLida()}
                title="Marcar como não lida — volta a aparecer como pendente para a equipe"
                aria-label="Marcar como não lida"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 30, padding: isMobile ? "0 10px" : "0 12px", borderRadius: 999, border: "1px solid var(--p-border)", background: "var(--p-surface)", color: "var(--wa-muted)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
                <Eye size={14} style={{ flexShrink: 0 }} />{!isMobile && <span>Não lida</span>}
              </button>}
              {!somenteLeitura && <button
                onClick={() => void arquivar(tab !== "arquivadas")}
                disabled={arquivando}
                title={tab === "arquivadas" ? "Devolver para a caixa" : "Arquivar — sai da caixa para toda a equipe, sem apagar nada"}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 30, padding: isMobile ? "0 10px" : "0 12px", borderRadius: 999, border: "1px solid var(--p-border)", background: "var(--p-surface)", color: "var(--wa-muted)", fontSize: 12.5, fontWeight: 700, cursor: arquivando ? "wait" : "pointer", whiteSpace: "nowrap", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
                <Archive size={14} style={{ flexShrink: 0 }} />{!isMobile && <span>{tab === "arquivadas" ? "Desarquivar" : "Arquivar"}</span>}
              </button>}
              {/* Dono do lead (atribuição): assumir / transferir.
                  Para quem acompanha vira ETIQUETA, não botão: saber de quem é a
                  conversa é metade do trabalho dela; poder trocar não é. */}
              {somenteLeitura ? (
                conv.assignedName ? (
                  <span title={`Dono: ${conv.assignedName}`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 30, padding: "0 12px", borderRadius: 999, border: "1px solid var(--p-border)", background: "var(--p-surface)", color: "var(--p-text)", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0, maxWidth: isMobile ? 130 : 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                    <UserRound size={14} style={{ flexShrink: 0 }} />{conv.assignedName}
                  </span>
                ) : null
              ) : (
              <div style={{ position: "relative", flexShrink: 0 }}>
                {(() => { const mineOwner = !!me && conv.assignedEmail === me; const assigned = !!conv.assignedEmail; return (
                  <button onClick={() => setOwnerMenu((o) => !o)} disabled={assigning} title={assigned ? `Dono: ${conv.assignedName}` : "Sem dono — assumir/atribuir"}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 30, padding: isMobile ? "0 10px" : "0 12px", borderRadius: 999, boxShadow: "0 1px 3px rgba(0,0,0,.06)", border: `1px solid ${assigned ? (mineOwner ? "var(--p-accent)" : "var(--p-border)") : "var(--p-border)"}`, background: mineOwner ? "var(--p-accent-soft)" : "var(--p-surface)", color: mineOwner ? "var(--p-accent)" : assigned ? "var(--p-text)" : "var(--wa-muted)", fontSize: 12.5, fontWeight: 700, cursor: assigning ? "wait" : "pointer", whiteSpace: "nowrap", maxWidth: isMobile ? 120 : 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                    <UserRound size={14} style={{ flexShrink: 0 }} />{!isMobile && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{assigned ? (mineOwner ? "Você" : conv.assignedName) : "Assumir"}</span>}
                  </button>
                ); })()}
                {ownerMenu && (
                  <>
                    <div onClick={() => setOwnerMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                    <div style={{ position: "absolute", right: 0, top: 38, zIndex: 41, width: 210, maxHeight: 260, overflowY: "auto", background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,.18)", padding: 6 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--wa-muted)", textTransform: "uppercase", letterSpacing: 0.5, padding: "4px 8px" }}>Dono do lead</div>
                      {/* Assumir (você): atendente só pode em lead LIVRE; admin sempre. */}
                      {me && conv.assignedEmail !== me && (isAdmin || !conv.assignedEmail) && (
                        <button onClick={() => assign(me)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "8px", border: "none", background: "transparent", cursor: "pointer", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "var(--p-accent)" }}><UserRound size={14} /> Assumir (você)</button>
                      )}
                      {/* Transferir para outro atendente — só admin. */}
                      {isAdmin && attendants.filter((a) => a.email !== me).map((a) => (
                        <button key={a.email} onClick={() => assign(a.email)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "8px", border: "none", background: "transparent", cursor: "pointer", borderRadius: 8, fontSize: 13, color: "var(--p-text)" }}>
                          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                          {conv.assignedEmail === a.email && <Check size={14} style={{ color: "var(--p-accent)" }} />}
                        </button>
                      ))}
                      {/* Remover dono — só admin. */}
                      {isAdmin && conv.assignedEmail && (
                        <button onClick={() => assign(null)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "8px", marginTop: 2, borderTop: "1px solid var(--p-border)", border: "none", background: "transparent", cursor: "pointer", fontSize: 12.5, color: "var(--wa-muted)" }}>Remover dono</button>
                      )}
                      {/* Atendente: sem ação sobre lead de outro (transferir/remover é do admin). */}
                      {!isAdmin && conv.assignedEmail && conv.assignedEmail !== me && (
                        <div style={{ padding: "8px", fontSize: 12, color: "var(--wa-muted)", lineHeight: 1.4 }}>Este lead é de <b style={{ color: "var(--p-text)" }}>{conv.assignedName}</b>. Só o admin pode transferir ou remover.</div>
                      )}
                      {!isAdmin && conv.assignedEmail === me && (
                        <div style={{ padding: "8px", fontSize: 12, color: "var(--wa-muted)", lineHeight: 1.4 }}>Você é o dono deste lead.</div>
                      )}
                    </div>
                  </>
                )}
              </div>
              )}
              {/* Etiquetas (tags) da conversa. Para quem acompanha, as etiquetas
                  da conversa continuam VISÍVEIS logo abaixo, no cabeçalho — o
                  que some é o menu de aplicar e tirar. */}
              {!somenteLeitura && <div style={{ position: "relative", flexShrink: 0 }}>
                <button onClick={() => setTagMenu((o) => !o)} title="Etiquetas"
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 30, padding: isMobile ? "0 10px" : "0 12px", borderRadius: 999, border: "1px solid var(--p-border)", background: "var(--p-surface)", color: (conv.tags?.length ? "var(--p-text)" : "var(--wa-muted)"), fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
                  <TagIcon size={14} style={{ flexShrink: 0 }} />{!isMobile && <span>{conv.tags?.length ? String(conv.tags.length) : "Etiquetas"}</span>}
                </button>
                {tagMenu && (
                  <>
                    <div onClick={() => setTagMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                    <div style={{ position: "absolute", right: 0, top: 38, zIndex: 41, width: 230, maxHeight: 300, overflowY: "auto", background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,.18)", padding: 6 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--wa-muted)", textTransform: "uppercase", letterSpacing: 0.5, padding: "4px 8px" }}>Etiquetas</div>
                      {allTags.map((t) => { const on = (conv.tags ?? []).some((x) => x.id === t.id); return (
                        <button key={t.id} onClick={() => toggleTag(t)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "7px 8px", border: "none", background: "transparent", cursor: "pointer", borderRadius: 8, fontSize: 13, color: "var(--p-text)" }}>
                          <span style={{ width: 11, height: 11, borderRadius: 3, background: t.color, flexShrink: 0 }} />
                          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                          {on && <Check size={14} style={{ color: "var(--p-accent)" }} />}
                        </button>
                      ); })}
                      {allTags.length === 0 && <div style={{ padding: "8px", fontSize: 12, color: "var(--wa-muted)" }}>Nenhuma etiqueta ainda. Crie a primeira abaixo.</div>}
                      <form onSubmit={(e) => { e.preventDefault(); const inp = (e.currentTarget.elements.namedItem("nt") as HTMLInputElement); createAndApplyTag(inp.value); inp.value = ""; }}
                        style={{ display: "flex", gap: 6, padding: "6px 4px 2px", marginTop: 4, borderTop: "1px solid var(--p-border)" }}>
                        <input name="nt" placeholder="Nova etiqueta…" maxLength={40} style={{ flex: 1, minWidth: 0, height: 30, padding: "0 8px", borderRadius: 8, border: "1px solid var(--p-border)", background: "var(--p-bg)", color: "var(--p-text)", fontSize: 12.5 }} />
                        <button type="submit" style={{ height: 30, padding: "0 11px", borderRadius: 8, border: "none", background: "var(--p-accent)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", lineHeight: 1 }}>+</button>
                      </form>
                    </div>
                  </>
                )}
              </div>}
              </div>
            </div>

            {buscaAberta && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "10px 12px 0" : "10px 8% 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, height: 34, padding: "0 12px", borderRadius: 10, background: "var(--p-surface)", border: "1px solid var(--p-border)" }}>
                  <Search size={14} style={{ color: "var(--wa-muted)", flexShrink: 0 }} />
                  <input autoFocus value={buscaThread} onChange={(e) => setBuscaThread(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") irParaAchado(1); if (e.key === "Escape") { setBuscaAberta(false); setBuscaThread(""); } }}
                    placeholder="Buscar nesta conversa"
                    style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: "var(--p-text)", fontSize: 13.5 }} />
                  {buscaThread.trim() && (
                    <span className="tnum" style={{ fontSize: 11.5, color: "var(--wa-muted)", flexShrink: 0 }}>
                      {achados.length === 0 ? "0" : `${achadoAtual + 1}/${achados.length}`}
                    </span>
                  )}
                  <button onClick={() => irParaAchado(-1)} disabled={!achados.length} aria-label="Ocorrência anterior" style={{ border: "none", background: "transparent", color: achados.length ? "var(--p-accent)" : "var(--p-border)", cursor: achados.length ? "pointer" : "default", padding: 2, display: "inline-flex" }}>
                    <ChevronDown size={14} style={{ transform: "rotate(180deg)" }} />
                  </button>
                  <button onClick={() => irParaAchado(1)} disabled={!achados.length} aria-label="Próxima ocorrência" style={{ border: "none", background: "transparent", color: achados.length ? "var(--p-accent)" : "var(--p-border)", cursor: achados.length ? "pointer" : "default", padding: 2, display: "inline-flex" }}>
                    <ChevronDown size={14} />
                  </button>
                  <button onClick={() => { setBuscaAberta(false); setBuscaThread(""); }} aria-label="Fechar busca" style={{ border: "none", background: "transparent", color: "var(--wa-muted)", cursor: "pointer", padding: 2, display: "inline-flex" }}>
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Pílulas flutuantes abaixo do header — ETAPA do funil + IA responder (estilo dos avisos). */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: isMobile ? "10px 12px 0" : "10px 8% 0" }}>
              {/* Etapa do funil — clicável: abre menu pra mudar manualmente (trava o automático). */}
              <div style={{ position: "relative" }}>
                {(() => { const st = conv.funnelStage; const color = st ? (STAGE[st]?.[1] ?? "var(--wa-muted)") : "var(--wa-muted)"; const label = st ? (STAGE[st]?.[0] ?? st) : "Etapa"; return (
                  <button onClick={() => somenteLeitura ? undefined : setStageMenu((o) => !o)} disabled={stageSaving || somenteLeitura}
                    title={somenteLeitura ? "Etapa do funil" : "Mudar a etapa do funil"}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px", borderRadius: 999, border: `1px solid ${st ? `color-mix(in srgb, ${color} 45%, transparent)` : "var(--p-border)"}`, background: st ? `color-mix(in srgb, ${color} 13%, var(--p-surface))` : "var(--p-surface)", color: st ? color : "var(--wa-muted)", fontSize: 12.5, fontWeight: 700, cursor: stageSaving ? "wait" : "pointer", whiteSpace: "nowrap", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: st ? color : "var(--wa-muted)", flexShrink: 0 }} />{label} <ChevronDown size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
                  </button>
                ); })()}
                {stageMenu && (<>
                  <div onClick={() => setStageMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 41, background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,.16)", overflow: "hidden", minWidth: 178 }}>
                    {STAGE_ORDER.map((s) => { const [label, color] = STAGE[s]; const active = conv.funnelStage === s; return (
                      <button key={s} onClick={() => changeStage(s)} disabled={stageSaving}
                        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 12px", border: "none", borderBottom: "1px solid var(--p-border)", background: active ? "var(--p-accent-soft)" : "transparent", color: "var(--p-text)", fontSize: 13, fontWeight: active ? 700 : 500, cursor: "pointer", textAlign: "left" }}>
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>{label}</span>
                        {active && <Check size={14} style={{ color: "var(--p-accent)", flexShrink: 0 }} />}
                      </button>
                    ); })}
                  </div>
                </>)}
              </div>
              {/* IA responder */}
              {!somenteLeitura && <button onClick={aiReply} disabled={aiReplying} title="Fazer a IA responder o lead agora (mesmo em horário comercial)"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 13px", borderRadius: 999, border: "1px solid color-mix(in srgb, var(--p-accent) 45%, transparent)", background: "var(--p-accent-soft)", color: "var(--p-accent)", fontSize: 12.5, fontWeight: 700, cursor: aiReplying ? "wait" : "pointer", opacity: aiReplying ? 0.6 : 1, whiteSpace: "nowrap", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
                <Sparkles size={14} /> {aiReplying ? "…" : "IA responder"}
              </button>}
            </div>

            {/* Por que o lead está nesta etapa — a frase que a IA usou (transparência p/ o cliente). */}
            {conv.funnelEvidence && (
              <div style={{ padding: isMobile ? "8px 12px" : "8px 8%" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "8px 11px", borderRadius: 10, background: "color-mix(in srgb, var(--p-accent) 10%, var(--p-surface))", border: "1px solid color-mix(in srgb, var(--p-accent) 24%, transparent)", fontSize: 11.5, color: "var(--p-text)", lineHeight: 1.45 }}>
                  <Sparkles size={13} style={{ color: "var(--p-accent)", flexShrink: 0, marginTop: 1 }} />
                  {/* A evidência é um TRECHO da mensagem do lead — pode trazer a
                      mesma URL gigante que estourava o balão. */}
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}><span style={{ fontWeight: 700, color: "var(--p-accent)" }}>Por que nesta etapa:</span> “{conv.funnelEvidence}”</span>
                </div>
              </div>
            )}

            {/* mensagens */}
            {/* `overflowX: hidden` é rede de segurança: um elemento largo que
                escape no futuro passa a ser cortado em vez de criar rolagem
                lateral — que é o que sequestrava a rolagem vertical no celular. */}
            <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, minWidth: 0, overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", padding: isMobile ? "12px 12px" : "16px 8%" }}>
              {/* Card do anúncio que originou o lead (estilo referral CTWA) */}
              {conv.lead && (conv.lead.image || conv.lead.adStrong) && (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                  <a href={conv.lead.sourceUrl ?? undefined} target="_blank" rel="noopener noreferrer" style={{ display: "flex", gap: 0, maxWidth: 380, width: "100%", background: "var(--wa-in)", border: "1px solid var(--p-border)", borderRadius: 12, overflow: "hidden", textDecoration: "none", color: "var(--wa-text)", boxShadow: "0 1px 3px rgba(0,0,0,.1)" }}>
                    {conv.lead.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={conv.lead.image} alt="" style={{ width: 88, height: 88, objectFit: "cover", flexShrink: 0 }} />
                    )}
                    <div style={{ padding: "10px 12px", minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--p-accent)", textTransform: "uppercase", letterSpacing: 0.4 }}>📣 Veio deste anúncio</div>
                      {conv.lead.adTitle && <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{conv.lead.adTitle}</div>}
                      {conv.lead.adBody && <div style={{ fontSize: 11.5, color: "var(--wa-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.lead.adBody}</div>}
                      {conv.lead.sourceUrl && <div style={{ fontSize: 11, color: "var(--p-accent)", marginTop: 4, fontWeight: 600 }}>ver anúncio →</div>}
                    </div>
                  </a>
                </div>
              )}
              {/* FAIXA DE ETIQUETAS. Antes elas viviam só como um NÚMERO dentro do
                  botão "Etiquetas" do topo: para saber quais estavam aplicadas era
                  preciso abrir o menu. No aplicativo elas aparecem coloridas junto
                  da conversa, e é o que faz a vendedora reconhecer o lead de
                  relance. Aqui ficam no mesmo lugar — dentro da conversa. */}
              {(conv.tags ?? []).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", margin: "2px 0 10px" }}>
                  {(conv.tags ?? []).map((t) => (
                    <span key={t.id} title={t.name}
                      style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: t.color, padding: "3px 9px", borderRadius: 20, letterSpacing: 0.2, whiteSpace: "nowrap", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", boxShadow: "0 1px 2px rgba(0,0,0,.12)" }}>
                      {t.name}
                    </span>
                  ))}
                </div>
              )}

              {grouped.map((g, gi) => (
                <div key={gi}>
                  <div style={{ display: "flex", justifyContent: "center", margin: "12px 0" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--wa-muted)", background: "var(--p-surface)", padding: "5px 12px", borderRadius: 8, boxShadow: "0 1px 1px rgba(0,0,0,.05)" }}>{g.day}</span>
                  </div>
                  {g.msgs.map((m) => {
                    const mine = m.direction === "out";
                    const body = (m.text && m.text.trim()) || mediaLabel(m.type) || "[mensagem]";
                    // Primeira mensagem DO LEAD que chegou depois da última
                    // visita: é onde a leitura parou. Só entrada — marcar as
                    // nossas próprias como "novas" não diz nada a ninguém.
                    const nova = corteNovas != null && !mine && Date.parse(m.timestamp) > corteNovas;
                    const primeiraNova = nova && !marcouNovas.current;
                    if (primeiraNova) marcouNovas.current = true;
                    return (
                      <div key={`w-${m.id}`}>
                      {primeiraNova && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 10px" }}>
                          <span style={{ flex: 1, height: 1, background: "color-mix(in srgb, #1FA855 45%, transparent)" }} />
                          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: "#1FA855", whiteSpace: "nowrap" }}>MENSAGENS NOVAS</span>
                          <span style={{ flex: 1, height: 1, background: "color-mix(in srgb, #1FA855 45%, transparent)" }} />
                        </div>
                      )}
                      <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: m.reaction ? 15 : 4,
                        // item de flex não encolhe abaixo do conteúdo por padrão: sem
                        // isto a linha empurra o container, por mais maxWidth que o
                        // balão tenha.
                        minWidth: 0 }}>
                        <div data-bolha id={`msg-${m.id}`} style={{ outline: achados[achadoAtual] === m.id ? "2px solid var(--p-accent)" : undefined, outlineOffset: 2, maxWidth: isMobile ? "82%" : "65%", minWidth: 0, padding: "6px 9px 5px", fontSize: 13.5, lineHeight: 1.4,
                          // `pre-wrap` preserva as quebras que o lead digitou, mas só
                          // quebra em lugares NORMAIS — e uma URL não tem nenhum. O link
                          // do anúncio estourava o balão, criava rolagem lateral no chat
                          // e, com ela, travava a rolagem vertical.
                          whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word", boxShadow: "0 1px 1px rgba(0,0,0,.08)", position: "relative", opacity: m.pending ? 0.75 : 1,
                          background: mine ? "var(--p-accent)" : "var(--wa-in)", color: mine ? "var(--p-on-accent)" : "var(--wa-text)",
                          borderRadius: mine ? "8px 0 8px 8px" : "0 8px 8px 8px" }}>
                          {!mine && !m.pending && (m.type === "image" || m.type === "sticker")
                            ? <ThreadImage src={`/api/portal/${token}/conversations/${sel}/media/${m.id}`} caption={m.text} />
                            : !mine && !m.pending && (m.type === "audio" || m.type === "video" || m.type === "document")
                            ? <MediaContent url={`/api/portal/${token}/conversations/${sel}/media/${m.id}`} type={m.type} caption={m.text} transcription={m.transcription} accent="var(--p-accent)" incoming />
                            : <span>{body}</span>}
                          <span style={{ float: "right", fontSize: 10, opacity: 0.65, margin: "6px 0 -2px 8px", whiteSpace: "nowrap" }}>
                            {mine && m.aiGenerated !== undefined ? (m.aiGenerated ? "IA · " : `${m.sentByName || "Equipe"} · `) : ""}{hhmm(m.timestamp)}
                            {m.pending ? " ⧗" : mine ? <span style={{ marginLeft: 3, opacity: 1, color: m.readAt ? "#9BE1FF" : "inherit", fontWeight: m.readAt ? 700 : 400 }}>{(m.deliveredAt || m.readAt) ? "✓✓" : "✓"}</span> : null}
                          </span>
                          {m.reaction && (
                            <span style={{ position: "absolute", bottom: -12, [mine ? "left" : "right"]: 8, background: "var(--wa-in)", color: "var(--wa-text)", borderRadius: 11, padding: "1px 5px", fontSize: 12, lineHeight: "16px", boxShadow: "0 1px 3px rgba(0,0,0,.2)", border: "1px solid var(--p-border)" }}>{m.reaction}</span>
                          )}
                          {/* "A IA errou aqui" — só em resposta que a IA de fato
                              mandou, e só depois de confirmada pelo servidor.
                              Fica discreto: aparece ao passar o mouse pelo balão. */}
                          {mine && m.aiGenerated && !m.pending && !somenteLeitura && (
                            <button
                              className="pc-corrigir"
                              onClick={() => void corrigirIA(m.id)}
                              title="A IA errou aqui — registrar correção"
                              aria-label="A IA errou aqui — registrar correção"
                              style={{ position: "absolute", top: -9, left: -9, width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", border: "1px solid var(--p-border)", background: "var(--p-surface)", color: "var(--wa-muted)", cursor: "pointer", padding: 0, opacity: 0, transition: "opacity .15s ease" }}>
                              <AlertTriangle size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {respostasAbertas && (
              <div style={{ flexShrink: 0, borderTop: "1px solid var(--p-border)", background: "var(--p-surface)", maxHeight: 240, overflowY: "auto", padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <strong style={{ flex: 1, fontSize: 12, color: "var(--wa-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Respostas rápidas</strong>
                  <button onClick={novaResposta} style={{ fontSize: 12, fontWeight: 700, color: "var(--p-accent)", background: "transparent", border: "none", cursor: "pointer" }}>+ nova</button>
                  <button onClick={() => setRespostasAbertas(false)} aria-label="Fechar" style={{ border: "none", background: "transparent", color: "var(--wa-muted)", cursor: "pointer", display: "inline-flex", padding: 2 }}><X size={14} /></button>
                </div>
                {respostas.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: "var(--wa-muted)", margin: 0 }}>
                    Nenhuma ainda. Toque em “+ nova” para guardar uma frase que você repete todo dia.
                  </p>
                ) : respostas.map((t, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                    <button
                      onClick={() => {
                        setDraft((d) => (d.trim() ? `${d.trim()} ${t}` : t));
                        if (sel) gravarRascunho(sel, t);
                        setRespostasAbertas(false);
                        taRef.current?.focus();
                      }}
                      style={{ flex: 1, minWidth: 0, textAlign: "left", fontSize: 13, color: "var(--p-text)", background: "var(--p-bg)", border: "1px solid var(--p-border)", borderRadius: 9, padding: "8px 10px", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t}
                    </button>
                    <button onClick={() => gravarRespostas(respostas.filter((_, j) => j !== i))} aria-label={`Apagar resposta ${i + 1}`} title="Apagar" style={{ border: "none", background: "transparent", color: "var(--wa-muted)", cursor: "pointer", display: "inline-flex", padding: 4, flexShrink: 0 }}>
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* CATÁLOGO — abre acima do compositor, não em outra tela: a consulta
                de preço acontece no meio da conversa, e sair dela era o atrito. */}
            {catalogoAberto && (
              // Altura RELATIVA à tela no celular: com 300px fixos, o painel mais o
              // compositor mais o teclado aberto não cabiam — a tela se
              // reorganizava embaixo do dedo ao abrir o catálogo.
              <div style={{ flexShrink: 0, borderTop: "1px solid var(--p-border)", background: "var(--p-surface)", maxHeight: isMobile ? "min(300px, 42dvh)" : 300, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px 8px" }}>
                  <Search size={15} style={{ color: "var(--wa-muted)", flexShrink: 0 }} />
                  {/* Sem autoFocus no celular: abrir o catálogo levantava o teclado
                      sem ninguém pedir, e a tela inteira se reacomodava na hora em
                      que a pessoa ia tocar num item. No desktop o foco ajuda. */}
                  <input
                    autoFocus={!isMobile}
                    value={catalogoBusca}
                    onChange={(e) => setCatalogoBusca(e.target.value)}
                    placeholder="Buscar no catálogo"
                    style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none", fontSize: 13.5, color: "var(--p-text)" }}
                  />
                  <button onClick={() => setCatalogoAberto(false)} aria-label="Fechar catálogo" style={{ display: "inline-flex", border: "none", background: "transparent", color: "var(--wa-muted)", cursor: "pointer", padding: 4 }}>
                    <X size={15} />
                  </button>
                </div>
                <div style={{ overflowY: "auto", padding: "0 8px 10px" }}>
                  {catalogo === null ? (
                    <p style={{ fontSize: 12.5, color: "var(--wa-muted)", padding: "6px 6px 10px", margin: 0 }}>Carregando…</p>
                  ) : catalogo.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: "var(--wa-muted)", padding: "6px 6px 10px", margin: 0 }}>
                      {catalogoBusca.trim() ? "Nenhum item com esse nome." : "O catálogo deste cliente está vazio."}
                    </p>
                  ) : catalogo.map((it) => (
                    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 10, padding: 7, borderRadius: 10, minWidth: 0 }}>
                      <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 8, overflow: "hidden", background: "var(--p-raise)", border: "1px solid var(--p-border)" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {it.imageUrl ? <img src={it.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--p-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
                        {it.price != null && <div className="tnum" style={{ fontSize: 12, color: "var(--p-accent)", fontWeight: 700 }}>{precoBR(it.price)}</div>}
                      </div>
                      {/* No celular o alvo tinha ~22px de altura — menos da metade do
                          mínimo confortável. Errar o toque num alvo desse tamanho é o
                          que produz toque duplo sem querer. */}
                      <button onClick={() => inserirItem(it)} title="Inserir no texto" style={{ fontSize: 11.5, fontWeight: 700, color: "var(--wa-muted)", background: "transparent", border: "1px solid var(--p-border)", borderRadius: 8, padding: isMobile ? "9px 12px" : "5px 9px", minHeight: isMobile ? 38 : undefined, cursor: "pointer", flexShrink: 0 }}>
                        texto
                      </button>
                      {it.imageUrl && (
                        <button onClick={() => void enviarItemComFoto(it)} disabled={!!enviandoItem} title="Enviar a foto com nome e preço" style={{ fontSize: 11.5, fontWeight: 700, color: "var(--p-on-accent)", background: "var(--p-accent)", border: "none", borderRadius: 8, padding: isMobile ? "9px 13px" : "5px 10px", minHeight: isMobile ? 38 : undefined, cursor: enviandoItem ? "wait" : "pointer", flexShrink: 0, opacity: enviandoItem && enviandoItem !== it.id ? 0.5 : 1 }}>
                          {enviandoItem === it.id ? "enviando…" : "enviar foto"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Compositor — a equipe responde o lead por texto livre daqui (dentro da janela de 24h). */}
            <div style={{ background: "var(--p-surface)", borderTop: "1px solid var(--p-border)", flexShrink: 0, padding: isMobile ? `10px 12px calc(18px + env(safe-area-inset-bottom))` : `8px 12px calc(8px + env(safe-area-inset-bottom))` }}>
              {/* Fila visível: sem isto, "mandei e não apareceu" viraria a
                  sensação de que o portal engoliu a mensagem. */}
              {fila.length > 0 && (
                <div role="status" style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 2px 6px", fontSize: 11.5, color: "var(--wa-muted)" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#f5b544", animation: "portalRecBlink 1.6s steps(1) infinite", flexShrink: 0 }} />
                  {fila.length === 1 ? "Sem conexão — 1 mensagem sai assim que a rede voltar." : `Sem conexão — ${fila.length} mensagens saem assim que a rede voltar.`}
                </div>
              )}
              {iaPaused && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 2px 6px", fontSize: 11.5, color: "var(--wa-muted)" }}>
                  <Sparkles size={12} style={{ color: "var(--p-accent)" }} /> IA em pausa — sua equipe assumiu esta conversa.
                </div>
              )}
              {sendError && (
                <div role="alert" style={{ padding: "6px 10px", marginBottom: 6, fontSize: 12, borderRadius: 8, background: "color-mix(in srgb, #d6453d 12%, transparent)", color: "#d6453d" }}>{sendError}</div>
              )}
              {somenteLeitura ? (
                // Sumir sem dizer nada faria parecer defeito. A faixa explica o
                // papel, e o tom é de função — não de bloqueio.
                <div style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "9px 4px", color: "var(--wa-muted)", fontSize: 12, lineHeight: 1.45 }}>
                  <Eye size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>Seu acesso é de <b style={{ color: "var(--p-text)" }}>acompanhamento</b>: você lê as conversas da equipe, e quem atende responde pelo próprio WhatsApp.</span>
                </div>
              ) : conv.windowOpen ? (
                <>
                  <input ref={imgInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onPickFile("image")} />
                  <input ref={docInputRef} type="file" style={{ display: "none" }} onChange={onPickFile("document")} />
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
                    {recording ? (
                      <>
                        <button onClick={cancelRecording} aria-label="Cancelar gravação" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 44, flexShrink: 0, border: "none", background: "transparent", color: "#d6453d", cursor: "pointer" }}>
                          <X size={22} />
                        </button>
                        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 9, height: 44, padding: "0 14px", borderRadius: 12, background: "var(--p-bg)", border: "1px solid var(--p-border)" }}>
                          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#d6453d", animation: "portalRecBlink 1s steps(1) infinite", flexShrink: 0 }} />
                          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--p-text)", fontVariantNumeric: "tabular-nums" }}>{Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, "0")}</span>
                          <span style={{ fontSize: 12, color: "var(--wa-muted)", marginLeft: "auto" }}>gravando áudio…</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <button onClick={() => docInputRef.current?.click()} disabled={sending} aria-label="Enviar documento" title="Enviar documento" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 44, flexShrink: 0, border: "none", background: "transparent", color: "var(--wa-muted)", cursor: "pointer" }}>
                          <Paperclip size={21} />
                        </button>
                        <button onClick={() => imgInputRef.current?.click()} disabled={sending} aria-label="Enviar imagem" title="Enviar imagem" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 44, flexShrink: 0, border: "none", background: "transparent", color: "var(--wa-muted)", cursor: "pointer" }}>
                          <Camera size={21} />
                        </button>
                        <button onClick={() => setRespostasAbertas((v) => !v)} disabled={sending} aria-label="Respostas rápidas" title="Respostas rápidas — frases que você usa todo dia" aria-expanded={respostasAbertas} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 44, flexShrink: 0, border: "none", background: "transparent", color: respostasAbertas ? "var(--p-accent)" : "var(--wa-muted)", cursor: "pointer" }}>
                          <Zap size={20} />
                        </button>
                        <button onClick={() => setCatalogoAberto((v) => !v)} disabled={sending} aria-label="Consultar o catálogo" title="Catálogo — preço e foto sem sair da conversa" aria-expanded={catalogoAberto} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 44, flexShrink: 0, border: "none", background: "transparent", color: catalogoAberto ? "var(--p-accent)" : "var(--wa-muted)", cursor: "pointer" }}>
                          <Package size={21} />
                        </button>
                        <textarea
                          ref={taRef}
                          value={draft}
                          onChange={onComposerInput}
                          onKeyDown={onComposerKey}
                          disabled={sending}
                          rows={1}
                          placeholder="Mensagem"
                          style={{ flex: 1, resize: "none", maxHeight: 120, minHeight: 44, padding: "11px 12px", borderRadius: 12, border: "1px solid var(--p-border)", background: "var(--p-bg)", color: "var(--p-text)", fontSize: isMobile ? 16 : 14, lineHeight: 1.35, outline: "none", fontFamily: "inherit" }}
                        />
                      </>
                    )}
                    <button
                      onClick={() => { if (recording) stopAndSendRecording(); else if (draft.trim()) void send(); else void startRecording(); }}
                      disabled={sending}
                      aria-label={recording || draft.trim() ? "Enviar" : "Gravar áudio"}
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, flexShrink: 0, borderRadius: "50%", border: "none", background: "var(--p-accent)", color: "var(--p-on-accent)", cursor: sending ? "default" : "pointer", opacity: sending ? 0.55 : 1 }}>
                      {recording || draft.trim() ? <Send size={18} /> : <Mic size={20} />}
                    </button>
                  </div>
                  {!isMobile && (
                    <div style={{ padding: "5px 2px 0", fontSize: 10.5, color: "var(--wa-muted)" }}>
                      Enter envia · Shift+Enter quebra linha · ao responder, a IA pausa e sua equipe assume.
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "9px 4px", color: "var(--wa-muted)", fontSize: 12, lineHeight: 1.4 }}>
                  <Eye size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>A janela de 24h fechou — o lead precisa mandar uma mensagem para você poder responder por aqui. Você ainda pode acionar a ✨ IA acima.</span>
                </div>
              )}
            </div>
          </>
        )}
        </div>
      </main>
      </div>
      </div>

      {pendingMedia && (
        <div onClick={cancelPendingMedia} role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--p-surface)", borderRadius: 16, maxWidth: 420, width: "100%", overflow: "hidden", boxShadow: "0 24px 70px rgba(0,0,0,.4)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--p-border)" }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: "var(--p-text)" }}>Enviar {pendingMedia.kind === "image" ? "imagem" : "documento"}</span>
              <button onClick={cancelPendingMedia} aria-label="Cancelar" style={{ border: "none", background: "transparent", color: "var(--wa-muted)", cursor: "pointer", display: "inline-flex" }}><X size={18} /></button>
            </div>
            <div style={{ padding: 16 }}>
              {pendingMedia.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pendingMedia.url} alt="pré-visualização" style={{ maxWidth: "100%", maxHeight: "50dvh", borderRadius: 10, display: "block", margin: "0 auto" }} />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, borderRadius: 10, background: "var(--p-bg)", border: "1px solid var(--p-border)" }}>
                  <Paperclip size={20} style={{ color: "var(--p-accent)", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: "var(--p-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pendingMedia.file.name}</span>
                </div>
              )}
              <input value={mediaCaption} onChange={(e) => setMediaCaption(e.target.value)} placeholder="Legenda (opcional)…" onKeyDown={(e) => { if (e.key === "Enter") confirmSendMedia(); }}
                style={{ width: "100%", marginTop: 12, height: 42, padding: "0 12px", borderRadius: 10, border: "1px solid var(--p-border)", background: "var(--p-bg)", color: "var(--p-text)", fontSize: 14, outline: "none" }} />
            </div>
            <div style={{ display: "flex", gap: 8, padding: "0 16px 16px", justifyContent: "flex-end" }}>
              <button onClick={cancelPendingMedia} style={{ height: 40, padding: "0 16px", borderRadius: 10, border: "1px solid var(--p-border)", background: "transparent", color: "var(--p-text)", fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
              <button onClick={confirmSendMedia} disabled={sending} style={{ height: 40, padding: "0 18px", borderRadius: 10, border: "none", background: "var(--p-accent)", color: "var(--p-on-accent)", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, opacity: sending ? 0.6 : 1 }}><Send size={15} /> Enviar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
