"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  History,
  Loader2,
  MessageSquarePlus,
  Navigation,
  NotebookPen,
  Plus,
  Search,
  Sparkles,
  UserRound,
  X,
  Zap,
} from "lucide-react";

type SearchItem = {
  id: string;
  type: "client" | "task" | "campaign" | "user" | "nav" | "action" | "note" | "activity";
  title: string;
  subtitle?: string;
  meta?: string;
  href: string;
  actionId?: Exclude<ActionMode, null>;
};

type SearchResponse = {
  clients: SearchItem[];
  tasks: SearchItem[];
  campaigns: SearchItem[];
  users: SearchItem[];
  activities: SearchItem[];
};

type ClientOption = { id: string; name: string; status: string };
type UserOption = { id: string; title: string };
type ActionMode = "task" | "client" | "campaign" | "note" | "calendar" | null;
type CommandOpenEvent = CustomEvent<{ mode?: Exclude<ActionMode, null> }>;

const quickActions = [
  { id: "task" as const, label: "Criar tarefa", hint: "Nova demanda operacional", icon: ClipboardList },
  { id: "client" as const, label: "Criar cliente", hint: "Adicionar conta", icon: Building2 },
  { id: "campaign" as const, label: "Criar campanha", hint: "Tarefa do tipo campanha", icon: FilePlus2 },
  { id: "note" as const, label: "Adicionar observacao", hint: "Registrar contexto no feed", icon: MessageSquarePlus },
  { id: "calendar" as const, label: "Abrir calendario", hint: "Selecionar cliente e abrir agenda", icon: Navigation },
];

const navigationItems: SearchItem[] = [
  { id: "nav-today", type: "nav", title: "Hoje", subtitle: "Central operacional do dia", href: "/today", meta: "Navegar" },
  { id: "nav-pending", type: "nav", title: "Pendencias", subtitle: "Bloqueios e aprovacoes", href: "/pending", meta: "Navegar" },
  { id: "nav-clients", type: "nav", title: "Clientes", subtitle: "Contas ativas e contexto", href: "/clients", meta: "Navegar" },
  { id: "nav-plans", type: "nav", title: "Templates operacionais", subtitle: "Modelos iniciais reutilizaveis", href: "/plans", meta: "Opcional" },
];

const emptySearch: SearchResponse = { clients: [], tasks: [], campaigns: [], users: [], activities: [] };

export function CommandCenter() {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse>(emptySearch);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<ActionMode>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);

  const flatResults = useMemo(
    () => {
      const normalized = query.trim().toLowerCase();
      const actionItems: SearchItem[] = quickActions.map((action) => ({
        id: `action-${action.id}`,
        type: "action",
        title: action.label,
        subtitle: action.hint,
        href: "#",
        meta: "Acao",
        actionId: action.id,
      }));
      const clientMatch = pathname.match(/\/clients\/([^/]+)/);
      const contextualNav = clientMatch?.[1]
        ? [
            {
              id: "nav-calendar-current",
              type: "nav" as const,
              title: "Abrir calendario",
              subtitle: "Calendario do cliente atual",
              href: `/clients/${clientMatch[1]}/calendar`,
              meta: "Navegar",
            },
          ]
        : [];
      const localItems = [...navigationItems, ...contextualNav, ...actionItems].filter((item) => {
        if (!normalized) return true;
        return `${item.title} ${item.subtitle ?? ""}`.toLowerCase().includes(normalized);
      });
      return [...localItems, ...results.clients, ...results.tasks, ...results.campaigns, ...results.users, ...(results.activities ?? [])];
    },
    [pathname, query, results]
  );

  useEffect(() => {
    function onCommandOpen(event: Event) {
      const custom = event as CommandOpenEvent;
      setOpen(true);
      setMode(custom.detail?.mode ?? null);
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT";
      const commandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";

      if (commandK || (event.key === "/" && !isTyping)) {
        event.preventDefault();
        setOpen(true);
        setMode(null);
      }
    }

    window.addEventListener("veloce-command-open", onCommandOpen);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("veloce-command-open", onCommandOpen);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/search?q=${encodeURIComponent(query)}`)
      .then((res) => (res.ok ? res.json() : emptySearch))
      .then((data: SearchResponse) => {
        if (!cancelled) {
          setResults(data);
          setUsers(data.users.map((user) => ({ id: user.id, title: user.title })));
          setSelected(0);
        }
      })
      .catch(() => !cancelled && setResults(emptySearch))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/clients")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ClientOption[]) => setClients(data.filter((client) => client.status !== "INACTIVE")))
      .catch(() => setClients([]));
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    setMode(null);
    setSelected(0);
  }

  function goTo(item: SearchItem) {
    if (item.actionId) {
      setMode(item.actionId);
      setQuery("");
      return;
    }
    router.push(item.href);
    close();
  }

  function handleCommandKey(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (mode) setMode(null);
      else close();
      return;
    }

    if (mode) return;

    const count = flatResults.length;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((value) => Math.min(value + 1, Math.max(count - 1, 0)));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((value) => Math.max(value - 1, 0));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (flatResults[selected]) goTo(flatResults[selected]);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[9vh]"
      style={{ background: "rgba(15, 23, 42, 0.42)", backdropFilter: "blur(12px)" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="op-enter w-full overflow-hidden border"
        style={{
          background: "var(--bg-surface)",
          maxWidth: 720,
          borderColor: "rgba(148, 163, 184, 0.32)",
          borderRadius: "var(--radius-modal)",
          boxShadow: "var(--shadow-modal), 0 0 0 1px rgba(139,140,255,0.10)",
        }}
        onKeyDown={handleCommandKey}
      >
        <div className="flex h-16 items-center gap-3 border-b px-5" style={{ borderColor: "var(--border)" }}>
          {mode ? <Sparkles size={16} style={{ color: "var(--accent)" }} /> : <Search size={16} style={{ color: "var(--text-muted)" }} />}
          {!mode ? (
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setLoading(true);
                setQuery(event.target.value);
              }}
              placeholder="Comandar operacao: cliente, tarefa, campanha, responsavel..."
              className="h-full flex-1 bg-transparent text-[15px] outline-none"
              style={{ color: "var(--text-primary)" }}
            />
          ) : (
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {quickActions.find((action) => action.id === mode)?.label}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Acao rapida global
              </p>
            </div>
          )}
          {loading && !mode && <Loader2 size={15} className="animate-spin" style={{ color: "var(--text-muted)" }} />}
          <button
            onClick={close}
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-elevated)]"
            title="Fechar"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={15} />
          </button>
        </div>

        <div className="max-h-[66vh] overflow-y-auto p-3">
          {mode ? (
            <QuickActionForm
              mode={mode}
              clients={clients}
              users={users}
              onBack={() => setMode(null)}
              onDone={(href) => {
                close();
                if (href) router.push(href);
                router.refresh();
              }}
            />
          ) : (
            <SearchResults items={flatResults} selected={selected} onSelect={goTo} />
          )}
        </div>

        <div className="flex items-center justify-between border-t px-5 py-3 text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "var(--bg-base)" }}>
          <span>Ctrl K abre de qualquer lugar</span>
          <span>Enter executa / Esc fecha</span>
        </div>
      </div>
    </div>
  );
}

function SearchResults({
  items,
  selected,
  onSelect,
}: {
  items: SearchItem[];
  selected: number;
  onSelect: (item: SearchItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
        <Search size={22} style={{ color: "var(--text-muted)", opacity: 0.5 }} />
        <p className="mt-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Nenhum rastro operacional encontrado</p>
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Tente cliente, tarefa, bloqueio, nota ou responsavel.</p>
      </div>
    );
  }

  return (
    <div className="py-1">
      {items.map((item, index) => (
        <button
          key={`${item.type}-${item.id}`}
          onClick={() => onSelect(item)}
          className="flex w-full items-center gap-3 px-3 text-left"
          style={{
            minHeight: 58,
            borderRadius: "var(--radius-card)",
            background: selected === index ? "var(--bg-elevated)" : "transparent",
            boxShadow: selected === index ? "inset 3px 0 0 var(--accent)" : "none",
            transition: "background var(--motion-hover) var(--ease-enter), box-shadow var(--motion-hover) var(--ease-enter)",
          }}
        >
          <ResultIcon type={item.type} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium" style={{ color: "var(--text-primary)" }}>{item.title}</span>
            <span className="block truncate text-xs" style={{ color: "var(--text-muted)" }}>{item.subtitle}</span>
          </span>
          {item.meta && (
            <span className="rounded-md border px-2 py-1 text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              {item.meta}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function ResultIcon({ type }: { type: SearchItem["type"] }) {
  const iconMap = {
    client: Building2,
    task: CheckCircle2,
    campaign: Zap,
    user: UserRound,
    nav: Navigation,
    action: Plus,
    note: NotebookPen,
    activity: History,
  };
  const Icon = iconMap[type];
  return (
    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
      <Icon size={15} />
    </span>
  );
}

function QuickActionForm({
  mode,
  clients,
  users,
  onBack,
  onDone,
}: {
  mode: Exclude<ActionMode, null>;
  clients: ClientOption[];
  users: UserOption[];
  onBack: () => void;
  onDone: (href?: string) => void;
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [taskType, setTaskType] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedClientId = clientId || clients[0]?.id || "";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);

    const selectedClient = clients.find((client) => client.id === selectedClientId);
    let res: Response;

    if (mode === "client") {
      res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone }),
      });
      const data = await res.json().catch(() => null);
      setSaving(false);
      if (!res.ok) return setError(data?.error ?? "Nao foi possivel criar o cliente.");
      return onDone(data?.id ? `/clients/${data.id}` : "/clients");
    }

    if (!selectedClientId) {
      setSaving(false);
      return setError("Selecione um cliente.");
    }

    if (mode === "note") {
      res = await fetch(`/api/clients/${selectedClientId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const data = await res.json().catch(() => null);
      setSaving(false);
      if (!res.ok) return setError(data?.error ?? "Nao foi possivel adicionar a observacao.");
      return onDone(selectedClient ? `/clients/${selectedClient.id}` : undefined);
    }

    res = await fetch(`/api/clients/${selectedClientId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        type: taskType || (mode === "campaign" ? "Campanha" : undefined),
        assignedTo: assignedTo || undefined,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) return setError(data?.error ?? "Nao foi possivel criar a tarefa.");
    return onDone(selectedClient ? `/clients/${selectedClient.id}` : undefined);
  }

  const isClient = mode === "client";
  const isNote = mode === "note";
  const isCalendar = mode === "calendar";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 p-2">
      {!isClient && (
        <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Cliente
          <select value={selectedClientId} onChange={(event) => setClientId(event.target.value)} className="h-10 rounded-lg border px-3 text-sm outline-none" style={{ borderColor: "var(--border-strong)", background: "var(--bg-surface)", color: "var(--text-primary)" }}>
            <option value="">Selecionar cliente</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
      )}

      {isCalendar ? (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => onDone(selectedClientId ? `/clients/${selectedClientId}/calendar` : "/clients")}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            Abrir calendario
          </button>
        </div>
      ) : isClient ? (
        <>
          <Field label="Nome do cliente" value={name} onChange={setName} required autoFocus />
          <Field label="Email" value={email} onChange={setEmail} type="email" />
          <Field label="Telefone" value={phone} onChange={setPhone} />
        </>
      ) : isNote ? (
        <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Observacao
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            required
            rows={5}
            className="resize-none rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--border-strong)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
            placeholder="Contexto operacional curto..."
          />
        </label>
      ) : (
        <>
          <Field label={mode === "campaign" ? "Nome da campanha" : "Titulo da tarefa"} value={title} onChange={setTitle} required autoFocus />
          <TagSelector value={taskType} onChange={setTaskType} />
          <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Responsavel
            <select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} className="h-10 rounded-lg border px-3 text-sm outline-none" style={{ borderColor: "var(--border-strong)", background: "var(--bg-surface)", color: "var(--text-primary)" }}>
              <option value="">Sem responsavel</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.title}</option>)}
            </select>
          </label>
        </>
      )}

      {error && <p className="rounded-lg px-3 py-2 text-xs" style={{ color: "var(--red)", background: "var(--red-soft)" }}>{error}</p>}

      {!isCalendar && <div className="mt-1 flex items-center justify-end gap-2">
        <button type="button" onClick={onBack} className="rounded-lg px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--bg-elevated)]" style={{ color: "var(--text-secondary)" }}>
          Voltar
        </button>
        <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
          {saving && <Loader2 size={13} className="animate-spin" />}
          Executar
        </button>
      </div>}
    </form>
  );
}

const TASK_TAGS = [
  "Post Feed", "Story", "Reels", "Campanha", "Criativo",
  "Relatório", "Copy", "Google Ads", "TikTok Ads", "Outro",
];

function TagSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        Tag / Tipo
      </span>
      <div className="flex flex-wrap gap-1.5">
        {TASK_TAGS.map((tag) => {
          const active = value === tag;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onChange(active ? "" : tag)}
              style={{
                padding: "4px 11px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: active ? 600 : 500,
                border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                background: active ? "var(--accent-soft)" : "var(--bg-elevated)",
                color: active ? "var(--accent)" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 100ms ease",
              }}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
      {label}
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        required={required}
        className="h-10 rounded-lg border px-3 text-sm outline-none"
        style={{ borderColor: "var(--border-strong)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
      />
    </label>
  );
}
