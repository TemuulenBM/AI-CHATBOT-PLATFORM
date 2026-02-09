import { useEffect, useRef } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { GlassCard } from "@/components/ui/glass-card";
import { useChatbotStore } from "@/store/chatbot-store";
import { useAuth } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle, MessageSquare, Bot, User, Clock } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { SkeletonConversation } from "@/components/ui/skeleton";

/**
 * Conversation Detail хуудас
 * Нэг conversation-ийн бүх мессежүүдийг chat bubble хэлбэрээр харуулна
 */
export default function ConversationDetail() {
  const { conversationDetail, isConversationDetailLoading, error, fetchConversationDetail, setGetToken } = useChatbotStore();
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const [, setLocation] = useLocation();
  // wouter нь URL params-ыг ингэж авдаг
  const params = useParams<{ id: string; conversationId: string }>();
  const chatbotId = params.id;
  const conversationId = params.conversationId;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Clerk token тохируулах
  useEffect(() => {
    if (getToken) {
      setGetToken(getToken);
    }
  }, [getToken, setGetToken]);

  // Auth шалгах + өгөгдөл татах
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setLocation('/login');
      return;
    }
    if (isSignedIn && chatbotId && conversationId) {
      fetchConversationDetail(chatbotId, conversationId);
    }
  }, [isLoaded, isSignedIn, chatbotId, conversationId]);

  // Мессеж ачаалагдсаны дараа хамгийн доод руу scroll хийх
  useEffect(() => {
    if (conversationDetail?.messages?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversationDetail?.messages]);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFullDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Sentiment badge — мессежийн sentiment утгыг өнгөөр ялгана
  const getSentimentBadge = (sentiment?: string) => {
    if (!sentiment) return null;
    const colors: Record<string, string> = {
      positive: "bg-green-500/10 text-green-400 border-green-500/20",
      neutral: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
      negative: "bg-red-500/10 text-red-400 border-red-500/20",
    };
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${colors[sentiment] || ""}`}>
        {sentiment}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="md:pl-64 px-4 md:px-8 pt-4 md:pt-8 pb-8">
        <div className="max-w-4xl mx-auto">
          {/* Толгой хэсэг: Буцах товч + мэдээлэл */}
          <header className="mb-6">
            <Button
              variant="ghost"
              size="sm"
              className="mb-4 gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => setLocation('/dashboard/conversations')}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Conversations
            </Button>

            {conversationDetail && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h1 className="text-xl md:text-2xl font-bold">Conversation</h1>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {conversationDetail.messages?.length || 0} messages
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatFullDate(conversationDetail.created_at)}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground font-mono bg-muted/50 px-2 py-1 rounded">
                  Session: {conversationDetail.session_id?.slice(0, 12)}...
                </div>
              </div>
            )}
          </header>

          {/* Алдааны мэдэгдэл */}
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Loading state */}
          {isConversationDetailLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonConversation key={i} />
              ))}
            </div>
          ) : !conversationDetail ? (
            /* Not found state */
            <GlassCard className="p-8 text-center">
              <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4 text-muted-foreground">
                <MessageSquare className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold mb-2">Conversation Not Found</h3>
              <p className="text-muted-foreground text-sm mb-4">
                This conversation may have been deleted or you don't have access to it.
              </p>
              <Button variant="outline" onClick={() => setLocation('/dashboard/conversations')}>
                Back to Conversations
              </Button>
            </GlassCard>
          ) : conversationDetail.messages?.length === 0 ? (
            /* Хоосон conversation */
            <GlassCard className="p-8 text-center">
              <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4 text-muted-foreground">
                <MessageSquare className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold mb-2">No Messages</h3>
              <p className="text-muted-foreground text-sm">
                This conversation has no messages yet.
              </p>
            </GlassCard>
          ) : (
            /* Мессежүүд — Chat bubble UI */
            <div className="space-y-4">
              {conversationDetail.messages.map((msg, index) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={index}
                    className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}
                  >
                    {/* Avatar */}
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                        isUser
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>

                    {/* Мессеж bubble */}
                    <div className={`max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
                      <div
                        className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          isUser
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-card border border-border rounded-tl-sm"
                        }`}
                      >
                        {/* Whitespace + newline-ийг хадгалахын тулд whitespace-pre-wrap */}
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      </div>

                      {/* Timestamp + sentiment */}
                      <div className={`flex items-center gap-2 mt-1 ${isUser ? "justify-end" : "justify-start"}`}>
                        <span className="text-[10px] text-muted-foreground">
                          {formatTimestamp(msg.timestamp)}
                        </span>
                        {getSentimentBadge(msg.sentiment)}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Автомат scroll-ийн зорилтот элемент */}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
