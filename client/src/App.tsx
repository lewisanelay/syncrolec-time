import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import ClockPage from "@/pages/ClockPage";
import ManagerPage from "@/pages/ManagerPage";
import EmployeesPage from "@/pages/EmployeesPage";
import CalendarPage from "@/pages/CalendarPage";
import NotFound from "@/pages/not-found";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <Switch>
          <Route path="/" component={ClockPage} />
          <Route path="/manager" component={ManagerPage} />
          <Route path="/employees" component={EmployeesPage} />
          <Route path="/calendar" component={CalendarPage} />
          <Route component={NotFound} />
        </Switch>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}
