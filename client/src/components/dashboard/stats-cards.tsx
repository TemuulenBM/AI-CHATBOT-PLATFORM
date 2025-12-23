import { GlassCard } from "@/components/ui/glass-card";
import { MessageSquare, Users, Zap, Clock } from "lucide-react";

const stats = [
  {
    label: "Total Messages",
    value: "12,403",
    trend: "+12.5%",
    icon: MessageSquare,
    color: "text-blue-400",
    bg: "bg-blue-400/10"
  },
  {
    label: "Active Users",
    value: "843",
    trend: "+8.2%",
    icon: Users,
    color: "text-purple-400",
    bg: "bg-purple-400/10"
  },
  {
    label: "Avg. Response",
    value: "1.2s",
    trend: "-5%",
    icon: Zap,
    color: "text-yellow-400",
    bg: "bg-yellow-400/10"
  },
  {
    label: "Resolution Rate",
    value: "94%",
    trend: "+2.1%",
    icon: Clock,
    color: "text-green-400",
    bg: "bg-green-400/10"
  }
];

export function StatsCards() {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {stats.map((stat, i) => (
        <GlassCard key={i} className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
              <stat.icon className="h-5 w-5" />
            </div>
            <span className="text-xs font-medium bg-green-500/10 text-green-400 px-2 py-1 rounded-full">
              {stat.trend}
            </span>
          </div>
          <div className="text-2xl font-bold mb-1">{stat.value}</div>
          <div className="text-sm text-muted-foreground">{stat.label}</div>
        </GlassCard>
      ))}
    </div>
  );
}
