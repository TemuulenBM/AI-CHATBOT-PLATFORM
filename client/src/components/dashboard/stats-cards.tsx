import { GlassCard } from "@/components/ui/glass-card";
import { MessageSquare, Bot, Zap, Users, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface StatsData {
  totalChatbots: number;
  activeChatbots: number;
  totalMessages: number;
  totalConversations: number;
  avgResponseTime?: number | null;
}

interface StatsCardsProps {
  stats?: StatsData;
  isLoading?: boolean;
}

export function StatsCards({ stats, isLoading = false }: StatsCardsProps) {
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  const statItems = [
    {
      label: "Total Chatbots",
      displayValue: formatNumber(stats?.totalChatbots ?? 0),
      icon: Bot,
      color: "text-blue-400",
      bg: "bg-blue-400/10"
    },
    {
      label: "Active Chatbots",
      displayValue: formatNumber(stats?.activeChatbots ?? 0),
      icon: Zap,
      color: "text-green-400",
      bg: "bg-green-400/10"
    },
    {
      label: "Total Messages",
      displayValue: formatNumber(stats?.totalMessages ?? 0),
      icon: MessageSquare,
      color: "text-purple-400",
      bg: "bg-purple-400/10"
    },
    {
      label: "Conversations",
      displayValue: formatNumber(stats?.totalConversations ?? 0),
      icon: Users,
      color: "text-yellow-400",
      bg: "bg-yellow-400/10"
    }
  ];

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {statItems.map((stat, i) => (
        <GlassCard key={i} className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
              <stat.icon className="h-5 w-5" />
            </div>
          </div>
          {isLoading ? (
            <>
              <Skeleton className="h-8 w-20 mb-1" />
              <Skeleton className="h-4 w-24" />
            </>
          ) : (
            <>
              <div className="text-2xl font-bold mb-1">{stat.displayValue}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </>
          )}
        </GlassCard>
      ))}
    </div>
  );
}
