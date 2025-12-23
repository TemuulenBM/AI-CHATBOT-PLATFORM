import { Sidebar } from "@/components/dashboard/sidebar";
import { GlassCard } from "@/components/ui/glass-card";
import { useChatbotStore } from "@/store/chatbot-store";
import { Button } from "@/components/ui/button";
import { Plus, MoreHorizontal, MessageSquare, ExternalLink } from "lucide-react";
import { Link } from "wouter";

export default function ChatbotsList() {
  const { chatbots } = useChatbotStore();

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

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {chatbots.map((bot) => (
              <GlassCard key={bot.id} className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <BotIcon />
                  </div>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                  </Button>
                </div>
                
                <h3 className="text-xl font-bold mb-1">{bot.name}</h3>
                <a href={bot.url} target="_blank" className="text-sm text-muted-foreground flex items-center gap-1 hover:text-primary mb-6">
                  {bot.url} <ExternalLink className="h-3 w-3" />
                </a>

                <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Status</div>
                    <div className={`text-sm font-medium flex items-center gap-2 ${
                      bot.status === 'active' ? 'text-green-400' : 'text-yellow-400'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        bot.status === 'active' ? 'bg-green-400' : 'bg-yellow-400'
                      }`} />
                      {bot.status.charAt(0).toUpperCase() + bot.status.slice(1)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Messages</div>
                    <div className="text-sm font-medium flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> {bot.messages_count}
                    </div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
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
