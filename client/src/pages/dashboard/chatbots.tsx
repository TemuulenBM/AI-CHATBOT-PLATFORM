import { useEffect } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { GlassCard } from "@/components/ui/glass-card";
import { useChatbotStore, Chatbot } from "@/store/chatbot-store";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Plus, MoreHorizontal, Globe, Trash2, ExternalLink, Loader2, Copy, AlertCircle } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

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
  const { chatbots, isLoading, error, fetchChatbots, deleteChatbot } = useChatbotStore();
  const { isAuthenticated } = useAuthStore();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation('/login');
      return;
    }
    fetchChatbots();
  }, [isAuthenticated]);

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
    const embedCode = `<script src="${window.location.origin}/widget.js" data-chatbot-id="${id}"></script>`;
    navigator.clipboard.writeText(embedCode);
    toast({
      title: "Copied!",
      description: "Embed code copied to clipboard",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="pl-64 p-8">
        <div className="max-w-7xl mx-auto">
          <header className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold mb-2">My Chatbots</h1>
              <p className="text-muted-foreground">Manage your AI assistants</p>
            </div>
            <Link href="/dashboard/create">
              <Button className="btn-gradient gap-2">
                <Plus className="h-4 w-4" /> Create Chatbot
              </Button>
            </Link>
          </header>

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : chatbots.length === 0 ? (
            <GlassCard className="p-12 text-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 text-primary">
                <BotIcon />
              </div>
              <h3 className="text-xl font-bold mb-2">No chatbots yet</h3>
              <p className="text-muted-foreground mb-6">Create your first AI chatbot to get started</p>
              <Link href="/dashboard/create">
                <Button className="btn-gradient gap-2">
                  <Plus className="h-4 w-4" /> Create Chatbot
                </Button>
              </Link>
            </GlassCard>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {chatbots.map((bot) => {
                const statusColor = getStatusColor(bot.status);
                return (
                  <GlassCard key={bot.id} className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <BotIcon />
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleCopyEmbed(bot.id)}>
                            <Copy className="h-4 w-4 mr-2" /> Copy Embed Code
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

                    <h3 className="text-xl font-bold mb-1">{bot.name}</h3>
                    <a
                      href={bot.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground flex items-center gap-1 hover:text-primary mb-6"
                    >
                      <Globe className="h-3 w-3" />
                      {bot.website_url} <ExternalLink className="h-3 w-3" />
                    </a>

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

function BotIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}
