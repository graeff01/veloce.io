"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock3, PauseCircle } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { formatDate } from "@/lib/utils";

type PendingTask = {
  id: string;
  clientId: string;
  title: string;
  dueDate: string;
  priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
  blocker: string | null;
  client: { id: string; name: string };
  assignee?: { id: string; name: string } | null;
};

type PendingData = {
  total: number;
  groups: Array<{ label: string; tasks: PendingTask[] }>;
};

const fallback: PendingData = { total: 0, groups: [] };

export function PendingContent() {
  const [data, setData] = useState<PendingData>(fallback);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/pending")
      .then((res) => (res.ok ? res.json() : fallback))
      .then(setData)
      .catch(() => setData(fallback))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>
      <div style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "26px 32px 22px" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>
            Operacao
          </p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 720, color: "var(--text-primary)", lineHeight: "30px" }}>
                Centro de Pendencias
              </h1>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 5 }}>
                Bloqueios que impedem a operacao de andar.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, color: data.total > 0 ? "var(--amber)" : "var(--green)" }}>
              <PauseCircle size={17} />
              <span style={{ fontSize: 13, fontWeight: 650 }}>{data.total} pendencias</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 32px 40px" }}>
        {loading ? (
          <div style={{ height: 240, borderRadius: 10, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }}>
            {data.groups.map((group) => (
              <section key={group.label}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                    {group.label}
                  </h2>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{group.tasks.length}</span>
                </div>
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", boxShadow: "var(--shadow-card)", minHeight: 180 }}>
                  {group.tasks.length === 0 ? (
                    <div style={{ minHeight: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12 }}>
                      Nenhum gargalo operacional.
                    </div>
                  ) : group.tasks.map((task) => <PendingRow key={task.id} task={task} />)}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PendingRow({ task }: { task: PendingTask }) {
  const urgent = task.priority === "CRITICAL" || task.priority === "HIGH";
  return (
    <Link href={`/clients/${task.clientId}/tasks`} style={{ textDecoration: "none", display: "block" }}>
      <div style={{ padding: 12, borderBottom: "1px solid var(--border)", transition: "background 140ms ease-out" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ marginTop: 2, color: urgent ? "var(--red)" : "var(--amber)" }}>
            <AlertTriangle size={14} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 640, color: "var(--text-primary)", lineHeight: "18px" }}>
              {task.title}
            </p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
              {task.client.name}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: urgent ? "var(--red)" : "var(--text-muted)" }}>
                <Clock3 size={11} />
                {formatDate(task.dueDate)}
              </span>
              {task.assignee && <Avatar name={task.assignee.name} size="xs" />}
            </div>
          </div>
          <ArrowRight size={13} style={{ color: "var(--text-muted)", marginTop: 2 }} />
        </div>
      </div>
    </Link>
  );
}
