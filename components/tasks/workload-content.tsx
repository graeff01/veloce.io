"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Loader2, AlertTriangle, Flag, Calendar, User } from "lucide-react";

interface WTask {
  id: string;
  title: string;
  type: string | null;
  status: string;
  priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
  dueDate: string;
  blocker: string | null;
  clientId: string;
  assignedTo: string | null;
  client: { id: string; name: string; brand: string | null; logoUrl: string | null };
  assignee: { id: string; name: string } | null;
}

const PRIO: Record<string, { label: string; color: string }> = {
  CRITICAL: { label: "Crítica", color: "#DC2626" },
  HIGH:     { label: "Alta",    color: "#D97706" },
  NORMAL:   { label: "Normal",  color: "#64748B" },
  LOW:      { label: "Baixa",   color: "#94A3B8" },
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function isOverdue(iso: string) {
  return new Date(iso) < new Date(new Date().toDateString());
}

export function WorkloadContent() {
  const { data: session } = useSession();
  const [tasks, setTasks] = useState<WTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyMine, setOnlyMine] = useState(false);

  useEffect(() => {
    fetch("/api/tasks/workload")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setTasks(Array.isArray(d) ? d : []))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, []);

  const myId = session?.user?.id;
  const visible = useMemo(
    () => (onlyMine && myId ? tasks.filter((t) => t.assignedTo === myId) : tasks),
    [tasks, onlyMine, myId]
  );

  // agrupa por responsável
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; id: string | null; tasks: WTask[] }>();
    for (const t of visible) {
      const key = t.assignedTo ?? "__none__";
      if (!map.has(key)) map.set(key, { name: t.assignee?.name ?? "Sem responsável", id: t.assignedTo, tasks: [] });
      map.get(key)!.tasks.push(t);
    }
    // sem responsável por último, demais por nº de tarefas desc
    return [...map.values()].sort((a, b) => {
      if (a.id === null) return 1;
      if (b.id === null) return -1;
      return b.tasks.length - a.tasks.length;
    });
  }, [visible]);

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>
      <div style={{ padding: "20px 32px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Tarefas por responsável</h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>{visible.length} tarefa(s) em aberto</p>
        </div>
        <button
          onClick={() => setOnlyMine((v) => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9,
            border: `1px solid ${onlyMine ? "var(--accent)" : "var(--border)"}`,
            background: onlyMine ? "var(--accent-soft)" : "var(--bg-base)",
            color: onlyMine ? "var(--accent)" : "var(--text-muted)",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          <User size={13} /> Minhas tarefas
        </button>
      </div>

      <div style={{ padding: "24px 32px" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
            <Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
          </div>
        ) : groups.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 20px", color: "var(--text-muted)" }}>
            <p style={{ fontSize: 14 }}>Nenhuma tarefa em aberto</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
            {groups.map((g) => {
              const overdue = g.tasks.filter((t) => isOverdue(t.dueDate)).length;
              return (
                <div key={g.id ?? "none"} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 26, height: 26, borderRadius: "50%", background: g.id ? "var(--accent-soft)" : "var(--bg-base)", color: "var(--accent)", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {g.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", flex: 1 }}>{g.name}</span>
                    {overdue > 0 && (
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: "#DC2626", background: "rgba(220,38,38,0.08)", padding: "2px 7px", borderRadius: 20 }}>
                        <AlertTriangle size={9} /> {overdue}
                      </span>
                    )}
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", minWidth: 20, textAlign: "center" }}>{g.tasks.length}</span>
                  </div>
                  <div style={{ maxHeight: 420, overflowY: "auto" }}>
                    {g.tasks.map((t, i) => {
                      const od = isOverdue(t.dueDate);
                      const p = PRIO[t.priority];
                      return (
                        <Link key={t.id} href={`/clients/${t.clientId}`} style={{ textDecoration: "none" }}>
                          <div style={{ padding: "10px 16px", borderBottom: i < g.tasks.length - 1 ? "1px solid var(--border)" : "none", display: "flex", flexDirection: "column", gap: 5 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.3 }}>{t.title}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{t.client.brand || t.client.name}</span>
                              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: od ? 700 : 500, color: od ? "#DC2626" : "var(--text-muted)" }}>
                                <Calendar size={9} /> {fmtDate(t.dueDate)}
                              </span>
                              {(t.priority === "HIGH" || t.priority === "CRITICAL") && (
                                <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: p.color }}>
                                  <Flag size={9} /> {p.label}
                                </span>
                              )}
                              {t.blocker && (
                                <span title={t.blocker} style={{ display: "inline-flex" }}><AlertTriangle size={10} color="#D97706" /></span>
                              )}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
