import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { GlassCard } from "@/components/ui/glass-card";
import { useChatbotStore } from "@/store/chatbot-store";
import { useAuth } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { MessageSquare, AlertCircle, Bot, ChevronLeft, ChevronRight, Filter, Clock, BookOpen } from "lucide-react";
import { useLocation, Link } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SkeletonConversation } from "@/components/ui/skeleton";

export default function Conversations() {
  const { allConversations, conversationsTotal, conversationsPage, conversationsTotalPages, fetchAllConversations, chatbots, fetchChatbots, isLoading, error, setGetToken } = useChatbotStore();
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedChatbot, setSelectedChatbot] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Initialize Clerk token in store
  useEffect(() => {
    if (getToken) {
      setGetToken(getToken);
    }
  }, [getToken, setGetToken]);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setLocation('/login');
      return;
    }
    if (isSignedIn) {
      fetchChatbots();
    }
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (isSignedIn) {
      fetchAllConversations(
        currentPage,
        20,
        selectedChatbot === "all" ? undefined : selectedChatbot
      );
    }
  }, [isSignedIn, currentPage, selectedChatbot]);

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;

    const diffMonths = Math.floor(diffDays / 30);
    return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleChatbotChange = (value: string) => {
    setSelectedChatbot(value);
    setCurrentPage(1); // Reset to first page when filter changes
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="md:pl-64 px-4 md:px-8 pt-4 md:pt-8 pb-8">
        <div className="max-w-5xl mx-auto">
          <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">Conversations</h1>
              <p className="text-muted-foreground text-sm md:text-base">
                View and manage all conversations across your chatbots
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
                <Select value={selectedChatbot} onValueChange={handleChatbotChange}>
                  <SelectTrigger className="w-[180px] md:w-[200px]">
                    <SelectValue placeholder="Filter by chatbot" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Chatbots</SelectItem>
                    {chatbots.map((bot) => (
                      <SelectItem key={bot.id} value={bot.id}>
                        {bot.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </header>

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {isLoading && allConversations.length === 0 ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonConversation key={i} />
              ))}
            </div>
          ) : allConversations.length === 0 ? (
            <GlassCard className="p-8 md:p-12 text-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 text-primary">
                <MessageSquare className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold mb-2">No Conversations Yet</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                {selectedChatbot === "all"
                  ? "Once your chatbots start receiving messages, conversations will appear here. Embed your widget to get started!"
                  : "This chatbot hasn't received any messages yet. Make sure it's embedded on your website."}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/dashboard/chatbots">
                  <Button className="btn-gradient gap-2">
                    <Bot className="h-4 w-4" /> View Chatbots
                  </Button>
                </Link>
                <Button variant="outline" asChild>
                  <a href="https://docs.convoai.com" target="_blank" rel="noopener noreferrer" className="gap-2">
                    <BookOpen className="h-4 w-4" /> Read Documentation
                  </a>
                </Button>
              </div>
            </GlassCard>
          ) : (
            <>
              <div className="mb-4 text-sm text-muted-foreground">
                Showing {allConversations.length} of {conversationsTotal} conversations
              </div>
              <div className="space-y-4">
                {allConversations.map((conv) => (
                  <GlassCard key={conv.id} className="p-4 md:p-6 hover:bg-card/50 transition-colors cursor-pointer">
                    <div className="flex items-start gap-4">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <Bot className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <h3 className="font-semibold truncate">
                              {conv.chatbotName || "Unknown Chatbot"}
                            </h3>
                            {conv.chatbotId && (
                              <span className="text-xs text-muted-foreground">
                                {conv.chatbotId.slice(0, 8)}...
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 md:gap-4 text-xs text-muted-foreground mb-3">
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {conv.messageCount} messages
                          </span>
                          <span className="hidden sm:inline">•</span>
                          <span>{getTimeAgo(conv.updatedAt)}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                          {conv.preview}
                        </p>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Started: {formatDate(conv.createdAt)}
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>

              {conversationsTotalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8">
                  <div className="text-sm text-muted-foreground">
                    Page {conversationsPage} of {conversationsTotalPages}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1 || isLoading}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(conversationsTotalPages, p + 1))}
                      disabled={currentPage === conversationsTotalPages || isLoading}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
