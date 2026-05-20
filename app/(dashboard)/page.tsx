import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DashboardContent } from "@/components/dashboard/dashboard-content";

export default async function DashboardPage() {
  let userName = "";
  try {
    const session = await getServerSession(authOptions);
    userName = session?.user.name ?? "";
  } catch {
    // no db yet — bypass mode
  }
  return <DashboardContent userName={userName} />;
}
