import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "./components/layout";

import Landing from "./pages/landing";
import Login from "./pages/login";
import Register from "./pages/register";
import Apply from "./pages/apply";
import Status from "./pages/status";
import Dashboard from "./pages/dashboard";
import Room from "./pages/room";
import Stations from "./pages/stations";
import Admin from "./pages/admin";
import NotFound from "./pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/apply" component={Apply} />
        <Route path="/status" component={Status} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/stations" component={Stations} />
        <Route path="/rooms/:id" component={Room} />
        <Route path="/admin" component={Admin} />
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
