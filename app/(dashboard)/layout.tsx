import { Sidebar } from "@/components/layout/sidebar";
import { CommandCenter } from "@/components/command-center/command-center";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen flex overflow-hidden" style={{ background: "var(--bg-base)" }}>
      <Sidebar />
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden" style={{ marginLeft: 240 }}>
        {children}
      </main>
      <CommandCenter />
    </div>
  );
}
