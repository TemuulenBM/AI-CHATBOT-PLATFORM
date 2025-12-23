import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Bot, LayoutDashboard, Settings, MessageSquare, LogOut, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { icon: LayoutDashboard, label: "Overview", href: "/dashboard" },
  { icon: Bot, label: "My Chatbots", href: "/dashboard/chatbots" },
  { icon: MessageSquare, label: "Conversations", href: "/dashboard/conversations" },
  { icon: Settings, label: "Settings", href: "/dashboard/settings" },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="w-64 border-r border-white/5 bg-card/30 backdrop-blur-xl h-screen flex flex-col fixed left-0 top-0 z-50">
      <div className="p-6">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white">
            <Bot className="h-5 w-5" />
          </div>
          <span>ChatAI</span>
        </Link>
      </div>

      <div className="px-4 mb-6">
        <Link href="/dashboard/create">
          <Button className="w-full btn-gradient gap-2">
            <Plus className="h-4 w-4" /> New Chatbot
          </Button>
        </Link>
      </div>

      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <div
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer",
                location === item.href
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="font-medium">{item.label}</span>
            </div>
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-white/5">
        <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive gap-3">
          <LogOut className="h-5 w-5" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
