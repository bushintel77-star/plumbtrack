import { Wrench, ClipboardList, Settings, MessageSquare, LayoutDashboard } from "lucide-react";
import type { Tab } from "@/types";

interface BottomNavProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  unreadCount?: number;
}

const tabs: { key: Tab; icon: typeof Wrench; label: string }[] = [
  { key: "jobs", icon: Wrench, label: "Jobs" },
  { key: "quotes", icon: ClipboardList, label: "Quotes" },
  { key: "messages", icon: MessageSquare, label: "Messages" },
  { key: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { key: "settings", icon: Settings, label: "Settings" },
];

export function BottomNav({ activeTab, onTabChange, unreadCount = 0 }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 app-bottom-nav" aria-label="Primary">
      {/* Frosted glass bar — safe-area padding keeps tabs clear of the home indicator */}
      <div className="app-nav backdrop-blur-xl border-t pb-[env(safe-area-inset-bottom)]">
        <div className="flex">
          {tabs.map(({ key, icon: Icon, label }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onTabChange(key)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 min-h-[56px] haptic relative ${                    active ? "text-accent" : "text-slate-400"
                }`}
                aria-label={label}
                aria-current={active ? "page" : undefined}
              >
                {/* Active indicator pill */}
                {active && (
                  <span className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-accent animate-fade-in" />
                )}
                <span className="relative">
                  <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
                  {key === "messages" && unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[9px] font-bold flex items-center justify-center leading-none animate-scale-in">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </span>
                <span className={`text-[10px] font-semibold transition-colors ${active ? "text-accent" : "text-slate-400"}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}