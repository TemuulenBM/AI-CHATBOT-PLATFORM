import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { SignIn, SignUp } from "@clerk/clerk-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import { CookieConsentBanner } from "@/components/gdpr/CookieConsentBanner";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import WidgetDemo from "@/pages/widget-demo";
import PrivacyPolicy from "@/pages/privacy-policy";
import Dashboard from "@/pages/dashboard/index";
import ChatbotsList from "@/pages/dashboard/chatbots";
import CreateChatbot from "@/pages/dashboard/create-chatbot";
import ChatbotSettings from "@/pages/dashboard/chatbot-settings";
import Conversations from "@/pages/dashboard/conversations";
import Settings from "@/pages/dashboard/settings";
import KnowledgeBase from "@/pages/dashboard/knowledge-base";
import Analytics from "@/pages/dashboard/analytics";
import ConversationDetail from "@/pages/dashboard/conversation-detail";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/widget/demo" component={WidgetDemo} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
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
      <Route path="/dashboard">
        <ErrorBoundary>
          <Dashboard />
        </ErrorBoundary>
      </Route>
      <Route path="/dashboard/chatbots">
        <ErrorBoundary>
          <ChatbotsList />
        </ErrorBoundary>
      </Route>
      <Route path="/dashboard/conversations">
        <ErrorBoundary>
          <Conversations />
        </ErrorBoundary>
      </Route>
      <Route path="/dashboard/create">
        <ErrorBoundary>
          <CreateChatbot />
        </ErrorBoundary>
      </Route>
      <Route path="/dashboard/chatbots/:id/settings">
        <ErrorBoundary>
          <ChatbotSettings />
        </ErrorBoundary>
      </Route>
      <Route path="/dashboard/chatbots/:id/knowledge">
        <ErrorBoundary>
          <KnowledgeBase />
        </ErrorBoundary>
      </Route>
      <Route path="/dashboard/chatbots/:id/conversations/:conversationId">
        <ErrorBoundary>
          <ConversationDetail />
        </ErrorBoundary>
      </Route>
      <Route path="/dashboard/chatbots/:id/analytics">
        <ErrorBoundary>
          <Analytics />
        </ErrorBoundary>
      </Route>
      <Route path="/dashboard/settings">
        <ErrorBoundary>
          <Settings />
        </ErrorBoundary>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <CookieConsentBanner />
        <ErrorBoundary>
          <Router />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
