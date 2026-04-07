import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initDefaultData } from "@/lib/storage";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Layout from "@/components/Layout";
import DoctorsPage from "@/pages/DoctorsPage";
import DoctorDetailPage from "@/pages/DoctorDetailPage";
import VisitLogPage from "@/pages/VisitLogPage";
import SnippetsPage from "@/pages/SnippetsPage";
import DashboardPage from "@/pages/DashboardPage";
import HospitalsPage from "@/pages/HospitalsPage";
import SettingsPage from "@/pages/SettingsPage";

initDefaultData();

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/doctors" component={DoctorsPage} />
        <Route path="/doctors/:id" component={DoctorDetailPage} />
        <Route path="/visit-log" component={VisitLogPage} />
        <Route path="/hospitals" component={HospitalsPage} />
        <Route path="/snippets" component={SnippetsPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
