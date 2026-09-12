"use client";

import { useEffect, useState } from "react";
import { Plus, X, Smartphone, AlertTriangle, CheckCircle2, ExternalLink, ShieldCheck } from "lucide-react";

// ── Conectar o WhatsApp de um funcionário, pelo portal ───────────────────────
// A gerente cadastra o número de quem trabalha com ela sem depender da agência.
//
// É a escrita mais poderosa do produto — liga um WhatsApp real a uma conta —, e
// o token que ela cola controla a WABA inteira. A tela assume isso em vez de
// esconder: diz o que cada campo é, onde achar, e que o token não volta a
// aparecer depois de salvo. Um formulário que finge ser trivial é o que faz
// alguém colar credencial no lugar errado.
//
// Só aparece para quem tem a permissão — que a agência concede uma a uma. Quem
// não tem nem vê o botão, e o servidor recusaria de qualquer jeito.

interface Numero { id: string; nome: string; equipe: string | null; dono: string | null }

export function PortalConectarNumero({ token, onConectado }: {
  token: string;
  onConectado?: () => void;
}) {
  const [pode, setPode] = useState(false);
  const [numeros, setNumeros] = useState<Numero[]>([]);
  const [aberto, setAberto] = useState(false);

  const carregar = () => {
    fetch(`/api/portal/${token}/numeros`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setPode(!!d.podeConectar); setNumeros(d.numeros ?? []); } })
      .catch(() => { /* sem a lista, o painel só não mostra o bloco */ });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(carregar, [token]);

  if (!pode) return null;

  return (
    <div className="p-panel">
      <div className="p-phead">
        <h2>Números da equipe</h2>
        <span className="hint">{numeros.length} conectado{numeros.length === 1 ? "" : "s"}</span>
      </div>

      <div style={{ padding: "4px 0" }}>
        {numeros.map((n) => (
          <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 18px", borderBottom: "1px solid var(--p-border)" }}>
            <Smartphone size={15} style={{ color: "var(--p-muted)", flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13.5, fontWeight: 650, color: "var(--p-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.nome}</span>
              {n.equipe && <span style={{ fontSize: 11.5, color: "var(--p-muted)", textTransform: "capitalize" }}>{n.equipe}</span>}
            </span>
            <CheckCircle2 size={15} style={{ color: "var(--p-good)", flexShrink: 0 }} />
          </div>
        ))}
      </div>

      <div style={{ padding: "12px 18px 16px" }}>
        <button onClick={() => setAberto(true)}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 36, padding: "0 14px", borderRadius: 10, border: "none", background: "var(--p-accent)", color: "var(--p-on-accent)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <Plus size={15} /> Conectar WhatsApp de um funcionário
        </button>
      </div>

      {aberto && (
        <FormularioConectar token={token} onFechar={() => setAberto(false)}
          onPronto={() => { setAberto(false); carregar(); onConectado?.(); }} />
      )}
    </div>
  );
}

export function FormularioConectar({ token, onFechar, onPronto }: {
  token: string; onFechar: () => void; onPronto: () => void;
}) {
  const [f, setF] = useState({
    name: "", ownerEmail: "", equipe: "", displayPhone: "",
    wabaId: "", phoneNumberId: "", accessToken: "", appSecret: "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  // "Salvou, mas ainda não recebe" — o caso em que a credencial entrou e a
  // assinatura na Meta não. Fechar a janela dizendo "pronto" seria mentir.
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape" && !salvando) onFechar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFechar, salvando]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setErro("");
    const r = await fetch(`/api/portal/${token}/numeros`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
    }).catch(() => null);
    setSalvando(false);
    const d = await r?.json().catch(() => null);
    if (!r?.ok) {
      setErro(d?.error ?? "Não foi possível conectar agora.");
      return;
    }
    // Guardado, mas a Meta não confirmou a entrega dos eventos. A pessoa PRECISA
    // ver isso — senão vai embora achando que está funcionando e só descobre
    // dias depois, quando ninguém receber mensagem nenhuma.
    if (d && d.recebendo === false) {
      setAviso(d.aviso || "O número foi salvo, mas a Meta ainda não confirmou a entrega das mensagens.");
      return;
    }
    onPronto();
  }

  return (
    <>
      <div onClick={() => !salvando && onFechar()} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.42)" }} />
      <form onSubmit={enviar} role="dialog" aria-label="Conectar WhatsApp de um funcionário"
        style={{ position: "fixed", zIndex: 201, left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "min(460px, calc(100vw - 28px))", maxHeight: "86vh", overflowY: "auto", background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 18, boxShadow: "0 24px 64px rgba(0,0,0,.32)" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "16px 18px", borderBottom: "1px solid var(--p-border)" }}>
          <Smartphone size={17} style={{ color: "var(--p-accent)" }} />
          <strong style={{ flex: 1, fontSize: 15, color: "var(--p-text)" }}>Conectar WhatsApp</strong>
          <button type="button" onClick={onFechar} aria-label="Fechar" disabled={salvando}
            style={{ border: "none", background: "transparent", color: "var(--p-muted)", cursor: "pointer", display: "inline-flex", padding: 5 }}><X size={17} /></button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="p-eyebrow">Quem vai atender</div>
            <Campo rotulo="Nome do funcionário" dica="É como este número aparece em todas as telas.">
              <input value={f.name} onChange={set("name")} required maxLength={80} placeholder="Ana Prado" style={inp} />
            </Campo>
            <Campo rotulo="Equipe (opcional)" dica="Agrupa os números no painel: consultoria, captação…">
              <input value={f.equipe} onChange={set("equipe")} maxLength={60} placeholder="consultoria" style={inp} />
            </Campo>
            <Campo rotulo="E-mail que identifica a pessoa (opcional)" dica="Serve só para separar as métricas dela. NÃO precisa ter acesso ao painel.">
              <input type="email" value={f.ownerEmail} onChange={set("ownerEmail")} placeholder="ana@empresa.com.br" style={inp} />
            </Campo>
            <Campo rotulo="Número exibido (opcional)">
              <input value={f.displayPhone} onChange={set("displayPhone")} maxLength={40} placeholder="+55 51 9..." style={inp} />
            </Campo>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4, borderTop: "1px solid var(--p-border)" }}>
            <div className="p-eyebrow" style={{ paddingTop: 12 }}>Dados da conta Meta</div>
            <p style={{ fontSize: 12, color: "var(--p-muted)", lineHeight: 1.55, margin: 0 }}>
              Estes três vêm do <b>WhatsApp Manager</b> da sua conta Meta, na configuração da API.
              {" "}
              <a href="https://business.facebook.com/wa/manage/phone-numbers/" target="_blank" rel="noreferrer"
                style={{ color: "var(--p-accent)", textDecoration: "none", whiteSpace: "nowrap" }}>
                abrir <ExternalLink size={10} style={{ display: "inline", verticalAlign: "-1px" }} />
              </a>
            </p>
            <Campo rotulo="ID da conta (WABA ID)">
              <input value={f.wabaId} onChange={set("wabaId")} required maxLength={60} placeholder="118714174662593" style={inp} />
            </Campo>
            <Campo rotulo="ID do número (Phone Number ID)" dica="É o ID, não o telefone. Fica ao lado do número na configuração da API.">
              <input value={f.phoneNumberId} onChange={set("phoneNumberId")} required maxLength={60} placeholder="385502153163016" style={inp} />
            </Campo>
            <Campo rotulo="Token de acesso" dica="Guardado cifrado. Depois de salvar, ele não aparece mais aqui — nem para você.">
              <input type="password" value={f.accessToken} onChange={set("accessToken")} required minLength={20} placeholder="EAAG…" style={{ ...inp, fontFamily: "ui-monospace, monospace" }} />
            </Campo>
            <Campo rotulo="App Secret (opcional)" dica="Confere a assinatura das mensagens que a Meta envia.">
              <input type="password" value={f.appSecret} onChange={set("appSecret")} placeholder="••••••" style={{ ...inp, fontFamily: "ui-monospace, monospace" }} />
            </Campo>
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "11px 13px", borderRadius: 11, background: "var(--p-raise)" }}>
            <ShieldCheck size={15} style={{ color: "var(--p-muted)", flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 11.5, color: "var(--p-muted)", lineHeight: 1.55 }}>
              O token é gravado cifrado e nunca mais sai daqui. Se um número já estiver
              conectado em outra conta, o cadastro é recusado.
            </span>
          </div>

          {erro && (
            <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "11px 13px", borderRadius: 11, background: "var(--p-crit-soft)", color: "var(--p-crit)", fontSize: 12.5, lineHeight: 1.5 }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {erro}
            </div>
          )}

          {aviso && (
            <div role="alert" style={{ display: "flex", flexDirection: "column", gap: 9, padding: "12px 14px", borderRadius: 11, background: "var(--p-warn-soft)" }}>
              <span style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, lineHeight: 1.55, color: "var(--p-text)" }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1, color: "var(--p-warn)" }} />
                <span>
                  <b>O número foi salvo, mas ainda não está recebendo.</b><br />{aviso}
                </span>
              </span>
              <span style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={salvando}
                  style={{ height: 32, padding: "0 12px", borderRadius: 9, border: "none", background: "var(--p-accent)", color: "var(--p-on-accent)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                  Tentar de novo
                </button>
                <button type="button" onClick={onPronto}
                  style={{ height: 32, padding: "0 12px", borderRadius: 9, border: "1px solid var(--p-border)", background: "transparent", color: "var(--p-muted)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                  Resolvo depois
                </button>
              </span>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={onFechar} disabled={salvando}
              style={{ flex: 1, height: 40, borderRadius: 11, border: "1px solid var(--p-border)", background: "transparent", color: "var(--p-muted)", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
              Cancelar
            </button>
            <button type="submit" disabled={salvando}
              style={{ flex: 2, height: 40, borderRadius: 11, border: "none", background: "var(--p-accent)", color: "var(--p-on-accent)", fontSize: 13.5, fontWeight: 700, cursor: salvando ? "wait" : "pointer", opacity: salvando ? 0.7 : 1 }}>
              {salvando ? "Conectando…" : "Conectar"}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}

function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--p-text)", marginBottom: 4 }}>{rotulo}</span>
      {children}
      {dica && <span style={{ display: "block", fontSize: 11, color: "var(--p-muted)", lineHeight: 1.45, marginTop: 4 }}>{dica}</span>}
    </label>
  );
}

const inp: React.CSSProperties = {
  height: 38, width: "100%", borderRadius: 10, border: "1px solid var(--p-border)",
  background: "var(--p-bg)", color: "var(--p-text)", padding: "0 11px",
  fontSize: 13.5, outline: "none", boxSizing: "border-box",
};
