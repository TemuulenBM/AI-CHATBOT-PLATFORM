import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard/index";
import ChatbotsList from "@/pages/dashboard/chatbots";
import CreateChatbot from "@/pages/dashboard/create-chatbot";
import AuthPage from "@/pages/auth";
import SignupPage from "@/pages/signup";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={AuthPage} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/dashboard/chatbots" component={ChatbotsList} />
      <Route path="/dashboard/create" component={CreateChatbot} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
