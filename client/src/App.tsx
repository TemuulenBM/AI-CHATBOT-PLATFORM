import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { SignIn, SignUp } from "@clerk/clerk-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard/index";
import ChatbotsList from "@/pages/dashboard/chatbots";
import CreateChatbot from "@/pages/dashboard/create-chatbot";
import ChatbotSettings from "@/pages/dashboard/chatbot-settings";
import Conversations from "@/pages/dashboard/conversations";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login">
        <div className="min-h-screen flex items-center justify-center bg-background">
          <SignIn
            routing="hash"
            signUpUrl="/signup"
            afterSignInUrl="/dashboard"
          />
        </div>
      </Route>
      <Route path="/signup">
        <div className="min-h-screen flex items-center justify-center bg-background">
          <SignUp
            routing="hash"
            signInUrl="/login"
            afterSignUpUrl="/dashboard"
          />
        </div>
      </Route>
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/dashboard/chatbots" component={ChatbotsList} />
      <Route path="/dashboard/conversations" component={Conversations} />
      <Route path="/dashboard/create" component={CreateChatbot} />
      <Route path="/dashboard/chatbots/:id/settings" component={ChatbotSettings} />
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
