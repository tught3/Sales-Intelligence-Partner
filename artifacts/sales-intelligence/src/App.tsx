import { Suspense, lazy, useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { hydrateLocalCache, initStorage, initDefaultData } from "@/lib/storage";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";

const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const DoctorsPage = lazy(() => import("@/pages/DoctorsPage"));
const DoctorDetailPage = lazy(() => import("@/pages/DoctorDetailPage"));
const VisitLogPage = lazy(() => import("@/pages/VisitLogPage"));
const VisitLogHistoryPage = lazy(() => import("@/pages/VisitLogHistoryPage"));
const ProductsPage = lazy(() => import("@/pages/ProductsPage"));
const SnippetsPage = lazy(() => import("@/pages/SnippetsPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const BulkImportPage = lazy(() => import("@/pages/BulkImportPage"));
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Suspense fallback={<RouteFallback />}>
        <Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/doctors" component={DoctorsPage} />
          <Route path="/doctors/:id" component={DoctorDetailPage} />
          <Route path="/visit-log" component={VisitLogPage} />
          <Route path="/visit-log-history" component={VisitLogHistoryPage} />
          <Route path="/products" component={ProductsPage} />
          <Route path="/snippets" component={SnippetsPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/bulk-import" component={BulkImportPage} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </Layout>
  );
}

function RouteFallback() {
  return (
    <div className="flex min-h-[45vh] items-center justify-center px-4">
      <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-primary" />
    </div>
  );
}

function App() {
  const [ready, setReady] = useState(() => hydrateLocalCache());
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    setReady(true);
    setIsSyncing(true);
    initStorage()
      .then(() => {
        setReady(true);
        initDefaultData().catch(console.error);
      })
      .catch(() => setReady(true))
      .finally(() => setIsSyncing(false));
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">데이터 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        {isSyncing && (
          <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-md border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm">
            <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-primary" />
            데이터 동기화 중...
          </div>
        )}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
