import { CalendarContent } from "@/components/calendar/calendar-content";

export default async function CalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CalendarContent clientId={id} />;
}
