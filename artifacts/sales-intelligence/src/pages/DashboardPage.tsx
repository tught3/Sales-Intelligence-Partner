import { useMemo } from "react";
import { useLocation } from "wouter";
import { doctorStorage, visitLogStorage, snippetStorage } from "@/lib/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  FileText,
  BookOpen,
  TrendingUp,
  Calendar,
  ArrowRight,
  Building2,
  Star,
} from "lucide-react";

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const doctors = useMemo(() => doctorStorage.getAll(), []);
  const logs = useMemo(() => visitLogStorage.getAll(), []);
  const snippets = useMemo(() => snippetStorage.getAll(), []);

  const recentLogs = useMemo(
    () =>
      [...logs]
        .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())
        .slice(0, 5),
    [logs]
  );

  const hospitals = useMemo(() => {
    const set = new Set(doctors.map((d) => d.hospital));
    return set.size;
  }, [doctors]);

  const thisMonthLogs = useMemo(() => {
    const now = new Date();
    return logs.filter((l) => {
      const d = new Date(l.visitDate);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [logs]);

  const stats = [
    {
      label: "총 교수 프로파일",
      value: doctors.length,
      icon: Users,
      color: "text-primary",
      bg: "bg-primary/10",
      href: "/doctors",
    },
    {
      label: "이번달 방문 일지",
      value: thisMonthLogs,
      icon: Calendar,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      href: "/visit-log",
    },
    {
      label: "핵심 멘트",
      value: snippets.length,
      icon: BookOpen,
      color: "text-purple-600",
      bg: "bg-purple-50",
      href: "/snippets",
    },
    {
      label: "담당 병원",
      value: hospitals,
      icon: Building2,
      color: "text-amber-600",
      bg: "bg-amber-50",
      href: "/doctors",
    },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">대시보드</h1>
        <p className="text-muted-foreground mt-1">JW중외제약 MR 영업 현황을 한눈에 확인하세요</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <button
              key={stat.label}
              type="button"
              onClick={() => setLocation(stat.href)}
              className="text-left"
            >
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                      <p className="text-3xl font-bold text-foreground">{stat.value}</p>
                    </div>
                    <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${stat.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent logs */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                최근 방문 일지
              </CardTitle>
              <button
                onClick={() => setLocation("/visit-log")}
                className="text-xs text-primary hover:underline flex items-center gap-0.5"
              >
                전체보기 <ArrowRight className="w-3 h-3" />
              </button>
            </CardHeader>
            <CardContent>
              {recentLogs.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">아직 방문 일지가 없습니다</p>
                  <Button size="sm" className="mt-3" onClick={() => setLocation("/visit-log")}>
                    일지 작성하기
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentLogs.map((log) => {
                    const doctor = doctors.find((d) => d.id === log.doctorId);
                    return (
                      <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Users className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-medium text-sm text-foreground truncate">
                              {doctor ? `${doctor.name} 교수` : '알 수 없음'}
                            </span>
                            <span className="text-xs text-muted-foreground flex-shrink-0">{log.visitDate}</span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{log.formattedLog}</p>
                          {log.products.length > 0 && (
                            <div className="flex gap-1 mt-1.5">
                              {log.products.map((p) => (
                                <Badge key={p} variant="secondary" className="text-xs py-0">
                                  {p}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick actions + top snippets */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">빠른 실행</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setLocation("/doctors")}>
                <Users className="w-4 h-4" />
                교수 프로파일 추가
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setLocation("/visit-log")}>
                <FileText className="w-4 h-4" />
                오늘 방문 일지 작성
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setLocation("/snippets")}>
                <BookOpen className="w-4 h-4" />
                핵심 멘트 추가
              </Button>
            </CardContent>
          </Card>

          {snippets.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500" />
                  인기 핵심 멘트
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {snippets
                    .sort((a, b) => b.effectiveness - a.effectiveness)
                    .slice(0, 3)
                    .map((s) => (
                      <div key={s.id} className="p-2.5 rounded-lg border text-xs">
                        <p className="text-foreground font-medium line-clamp-2 mb-1">"{s.content}"</p>
                        <Badge variant="outline" className="text-xs py-0">{s.product}</Badge>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
