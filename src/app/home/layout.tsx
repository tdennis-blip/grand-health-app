import { requirePatient } from "@/lib/auth/server";
import { BottomTabBar } from "./bottom-tab-bar";
import { getMyUnreadCount } from "@/lib/messages";

export default async function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePatient();

  const chatUnread = await getMyUnreadCount();

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Top status strip — a thin band that anchors the brand. We deliberately
          keep it minimal because mobile real estate matters and the tab bar
          covers nav. The sign-out lives on the Me tab now. */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-md mx-auto px-5 py-2.5 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-700 to-emerald-600 text-white text-xs font-bold flex items-center justify-center">G</div>
          <div className="text-sm font-semibold text-slate-900">Grand Health</div>
        </div>
      </header>

      {/* Scrollable content — padded at the bottom so the tab bar never
          covers the last bit of the page. */}
      <main className="flex-1 pb-24">{children}</main>

      <BottomTabBar chatUnread={chatUnread} />
    </div>
  );
}
