import { ClientDetailContent } from "@/components/clients/client-detail-content";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientDetailContent clientId={id} />;
}
