"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ShieldAlert, Trophy, MessageSquare, User } from "lucide-react";

const TABS = [
  { href: "/home",          label: "Today",     Icon: Home,         match: (p: string) => p === "/home" || p.startsWith("/home/training") || p.startsWith("/home/appointments") || p.startsWith("/home/diet") || p.startsWith("/home/sleep") },
  { href: "/home/pillars",  label: "Pillars",   Icon: ShieldAlert,  match: (p: string) => p.startsWith("/home/pillars") },
  { href: "/home/grand100", label: "Grand 100", Icon: Trophy,       match: (p: string) => p.startsWith("/home/grand100") },
  { href: "/home/chat",     label: "Chat",      Icon: MessageSquare,match: (p: string) => p.startsWith("/home/chat") },
  { href: "/home/profile",  label: "Me",        Icon: User,         match: (p: string) => p.startsWith("/home/profile") },
];

export function BottomTabBar({ chatUnread = 0 }: { chatUnread?: number }) {
  const pathname = usePathname() ?? "";
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 pb-[max(0px,env(safe-area-inset-bottom))]"
      aria-label="Primary"
    >
      <div className="max-w-md mx-auto flex justify-around px-2 pt-2 pb-2">
        {TABS.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          const badge = href === "/home/chat" ? chatUnread : 0;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 flex-1 ${
                active ? "text-teal-700" : "text-slate-400"
              }`}
            >
              <div className="relative">
                <Icon size={19} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 text-[9px] font-semibold text-white bg-rose-600 px-1 py-px rounded-full min-w-[14px] text-center leading-tight">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium whitespace-nowrap">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
