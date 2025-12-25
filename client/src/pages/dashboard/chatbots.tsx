import { useEffect } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { GlassCard } from "@/components/ui/glass-card";
import { useChatbotStore, Chatbot } from "@/store/chatbot-store";
import { useAuth } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Plus, MoreHorizontal, Globe, Trash2, ExternalLink, Copy, AlertCircle, Settings, BookOpen, BarChart3, Sparkles, PlayCircle } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { SkeletonCard } from "@/components/ui/skeleton";

function getStatusColor(status: Chatbot['status']) {
  switch (status) {
    case 'ready':
      return { text: 'text-green-400', bg: 'bg-green-400' };
    case 'scraping':
    case 'embedding':
      return { text: 'text-yellow-400', bg: 'bg-yellow-400' };
    case 'pending':
      return { text: 'text-blue-400', bg: 'bg-blue-400' };
    case 'failed':
      return { text: 'text-red-400', bg: 'bg-red-400' };
    default:
      return { text: 'text-gray-400', bg: 'bg-gray-400' };
  }
}

function getStatusLabel(status: Chatbot['status']) {
  switch (status) {
    case 'ready':
      return 'Active';
    case 'scraping':
      return 'Scraping...';
    case 'embedding':
      return 'Processing...';
    case 'pending':
      return 'Pending';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

export default function ChatbotsList() {
  const { chatbots, isLoading, error, fetchChatbots, deleteChatbot, setGetToken } = useChatbotStore();
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Initialize Clerk token in store and fetch chatbots
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setLocation('/login');
      return;
    }

    if (isSignedIn && getToken) {
      // Set the token getter first, then fetch
      setGetToken(getToken);
      fetchChatbots();
    }
  }, [isLoaded, isSignedIn, getToken, setGetToken, fetchChatbots, setLocation]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

    const success = await deleteChatbot(id);
    if (success) {
      toast({
        title: "Chatbot deleted",
        description: `"${name}" has been deleted.`,
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to delete chatbot",
        variant: "destructive",
      });
    }
  };

  const handleCopyEmbed = (id: string) => {
    // Industry-standard async embed code
    const embedCode = `<script async src="${window.location.origin}/widget.js" data-chatbot-id="${id}"></script>`;
    navigator.clipboard.writeText(embedCode);
    toast({
      title: "Copied!",
      description: "Embed code copied to clipboard. Paste it before </body> on your website.",
    });
  };

  const handleCopyAdvancedEmbed = (id: string) => {
    // Advanced embed with all options
    const embedCode = `<!-- ConvoAI Widget - Lazy Loading -->
<script async
  src="${window.location.origin}/widget/loader.js"
  data-chatbot-id="${id}"
  data-position="bottom-right"
  data-lazy="true"
></script>

<!-- JavaScript API available after load -->
<script>
  // Open widget programmatically
  // ConvoAI('open');

  // Identify logged-in users
  // ConvoAI('identify', { name: 'User Name', email: 'user@example.com' });

  // Listen to events
  // ConvoAI('on', 'message', function(data) { console.log(data); });
</script>`;
    navigator.clipboard.writeText(embedCode);
    toast({
      title: "Copied!",
      description: "Advanced embed code with JavaScript API examples copied.",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="md:pl-64 px-4 md:px-8 pt-4 md:pt-8 pb-8">
        <div className="max-w-5xl mx-auto">
          <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold mb-2">My Chatbots</h1>
              <p className="text-muted-foreground text-sm md:text-base">Manage your AI assistants</p>
            </div>
            <Link href="/dashboard/create">
              <Button className="btn-gradient gap-2">
                <Plus className="h-4 w-4" /> Create Chatbot
              </Button>
            </Link>
          </header>

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : chatbots.length === 0 ? (
            <GlassCard className="p-8 md:p-12 text-center">
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6 text-primary">
                <BotIcon className="h-10 w-10" />
              </div>
              <h3 className="text-xl font-bold mb-3">No Chatbots Yet</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Create your first AI chatbot to start engaging with your visitors 24/7.
                It takes less than 2 minutes!
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/dashboard/create">
                  <Button className="btn-gradient gap-2">
                    <Sparkles className="h-4 w-4" /> Create First Chatbot
                  </Button>
                </Link>
                <Button variant="outline" asChild>
                  <a href="https://www.youtube.com/watch?v=demo" target="_blank" rel="noopener noreferrer" className="gap-2">
                    <PlayCircle className="h-4 w-4" /> Watch Tutorial
                  </a>
                </Button>
              </div>
            </GlassCard>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {chatbots.map((bot) => {
                const statusColor = getStatusColor(bot.status);
                return (
                  <GlassCard key={bot.id} className="p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                          <BotIcon />
                        </div>
                        <div>
                          <h3 className="font-semibold">{bot.name}</h3>
                          <p className="text-sm text-muted-foreground">Chatbot details and status</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setLocation(`/dashboard/chatbots/${bot.id}/settings`)}>
                            <Settings className="h-4 w-4 mr-2" /> Settings
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setLocation(`/dashboard/chatbots/${bot.id}/knowledge`)}>
                            <BookOpen className="h-4 w-4 mr-2" /> Knowledge Base
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setLocation(`/dashboard/chatbots/${bot.id}/analytics`)}>
                            <BarChart3 className="h-4 w-4 mr-2" /> Analytics
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleCopyEmbed(bot.id)}>
                            <Copy className="h-4 w-4 mr-2" /> Copy Embed Code
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleCopyAdvancedEmbed(bot.id)}>
                            <Copy className="h-4 w-4 mr-2" /> Copy Advanced Embed
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => window.open(`/widget/demo?id=${bot.id}`, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" /> Test Widget
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-400"
                            onClick={() => handleDelete(bot.id, bot.name)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="mb-4">
                      <a
                        href={bot.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-muted-foreground flex items-center gap-1 hover:text-primary"
                      >
                        <Globe className="h-3 w-3" />
                        {bot.website_url} <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Status</div>
                        <div className={`text-sm font-medium flex items-center gap-2 ${statusColor.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${statusColor.bg}`} />
                          {getStatusLabel(bot.status)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Pages</div>
                        <div className="text-sm font-medium">
                          {bot.pages_scraped} scraped
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function BotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}
