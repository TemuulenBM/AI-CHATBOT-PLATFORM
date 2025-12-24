import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { GlassCard } from "@/components/ui/glass-card";
import { useChatbotStore } from "@/store/chatbot-store";
import { useAuth } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { MessageSquare, Loader2, AlertCircle, Bot, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { useLocation } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Conversations() {
  const { allConversations, conversationsTotal, conversationsPage, conversationsTotalPages, fetchAllConversations, chatbots, fetchChatbots, isLoading, error } = useChatbotStore();
  const { isSignedIn, isLoaded } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedChatbot, setSelectedChatbot] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

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
      <main className="pl-64 p-8">
        <div className="max-w-7xl mx-auto">
          <header className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold mb-2">Conversations</h1>
              <p className="text-muted-foreground">
                View and manage all conversations across your chatbots
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedChatbot} onValueChange={handleChatbotChange}>
                  <SelectTrigger className="w-[200px]">
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
              <AlertCircle className="h-5 w-5" />
              {error}
            </div>
          )}

          {isLoading && allConversations.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : allConversations.length === 0 ? (
            <GlassCard className="p-12 text-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 text-primary">
                <MessageSquare className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold mb-2">No conversations yet</h3>
              <p className="text-muted-foreground mb-6">
                {selectedChatbot === "all"
                  ? "Once your chatbots start receiving messages, conversations will appear here."
                  : "This chatbot hasn't received any messages yet."}
              </p>
            </GlassCard>
          ) : (
            <>
              <div className="mb-4 text-sm text-muted-foreground">
                Showing {allConversations.length} of {conversationsTotal} conversations
              </div>
              <div className="space-y-4">
                {allConversations.map((conv) => (
                  <GlassCard key={conv.id} className="p-6 hover:bg-card/50 transition-colors cursor-pointer">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            <Bot className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">
                                {conv.chatbotName || "Unknown Chatbot"}
                              </h3>
                              {conv.chatbotId && (
                                <span className="text-xs text-muted-foreground">
                                  ({conv.chatbotId.slice(0, 8)}...)
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                              <span>{conv.messageCount} messages</span>
                              <span>•</span>
                              <span>{getTimeAgo(conv.updatedAt)}</span>
                            </div>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                          {conv.preview}
                        </p>
                        <div className="text-xs text-muted-foreground mt-3">
                          Started: {formatDate(conv.createdAt)}
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>

              {conversationsTotalPages > 1 && (
                <div className="flex items-center justify-between mt-8">
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

