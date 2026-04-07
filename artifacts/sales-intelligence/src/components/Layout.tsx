import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  FileText,
  BookOpen,
  ChevronRight,
  Stethoscope,
  Building2,
  Settings,
  Brain,
  FolderInput,
  ClipboardList,
} from "lucide-react";

const navGroups = [
  {
    label: "메인",
    items: [
      { href: "/", label: "대시보드", icon: LayoutDashboard },
      { href: "/visit-log", label: "영업 일지 작성", icon: FileText },
      { href: "/visit-log-history", label: "방문 일지 기록", icon: ClipboardList },
      { href: "/bulk-import", label: "교수 파일 일괄 입력", icon: FolderInput },
    ],
  },
  {
    label: "데이터 관리",
    items: [
      { href: "/doctors", label: "교수 프로파일", icon: Users },
      { href: "/hospitals", label: "병원 & 과 특성", icon: Building2 },
      { href: "/snippets", label: "핵심 멘트 라이브러리", icon: BookOpen },
    ],
  },
  {
    label: "설정",
    items: [
      { href: "/settings", label: "매뉴얼 & 설정", icon: Settings },
    ],
  },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col fixed inset-y-0 left-0 z-40">
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center flex-shrink-0">
              <Stethoscope className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-sidebar-primary uppercase tracking-widest">JW중외제약</p>
              <p className="text-sm font-bold text-sidebar-foreground leading-tight">영업 AI 비서</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-5 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3 mb-1">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    item.href === "/"
                      ? location === "/"
                      : location === item.href || (item.href !== "/visit-log" && location.startsWith(item.href));
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
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-1.5 justify-center">
            <Brain className="w-3 h-3 text-sidebar-primary" />
            <p className="text-xs text-sidebar-foreground/50">AI 맥락 학습 활성</p>
          </div>
          <p className="text-xs text-sidebar-foreground/30 text-center mt-0.5">위너프 · 페린젝트</p>
        </div>
      </aside>

      <main className="flex-1 ml-64 min-h-screen bg-background">
        {children}
      </main>
    </div>
  );
}
