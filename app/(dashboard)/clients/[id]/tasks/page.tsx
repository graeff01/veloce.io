import { KanbanContent } from "@/components/tasks/kanban-content";

export default async function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KanbanContent clientId={id} />;
}
