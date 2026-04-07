import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  FileText,
  BookOpen,
  ChevronRight,
  Stethoscope,
} from "lucide-react";

const navItems = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/doctors", label: "교수 프로파일", icon: Users },
  { href: "/visit-log", label: "영업 일지 작성", icon: FileText },
  { href: "/snippets", label: "핵심 멘트 라이브러리", icon: BookOpen },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col fixed inset-y-0 left-0 z-40">
        {/* Brand */}
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center flex-shrink-0">
              <Stethoscope className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-sidebar-primary uppercase tracking-widest">JW중외제약</p>
              <p className="text-sm font-bold text-sidebar-foreground leading-tight">영업 비서</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/"
                ? location === "/"
                : location.startsWith(item.href);
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => setLocation(item.href)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer",
                  isActive
                    ? "bg-sidebar-primary text-white"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-70" />}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border">
          <p className="text-xs text-sidebar-foreground/40 text-center">
            위너프 · 페린젝트
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64 min-h-screen bg-background">
        {children}
      </main>
    </div>
  );
}
