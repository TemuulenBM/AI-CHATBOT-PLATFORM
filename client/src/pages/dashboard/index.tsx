import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { GlassCard } from "@/components/ui/glass-card";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuthStore } from "@/store/authStore";
import { useChatbotStore } from "@/store/chatbot-store";
import { useLocation } from "wouter";
import { Bot, Loader2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Dashboard() {
  const { isAuthenticated, user } = useAuthStore();
  const { stats, fetchStats, chatbots, fetchChatbots, messageVolume, fetchMessageVolume } = useChatbotStore();
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDays, setSelectedDays] = useState(7);

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation('/login');
      return;
    }

    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchStats(), fetchChatbots(), fetchMessageVolume(selectedDays)]);
      setIsLoading(false);
    };

    loadData();
  }, [isAuthenticated, selectedDays]);

  // Format date for chart display
  const formatChartData = () => {
    return messageVolume.map((point) => {
      const date = new Date(point.date);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      return {
        name: dayName,
        date: point.date,
        messages: point.messages,
      };
    });
  };

  const chartData = formatChartData();

  // Get recent chatbots for activity
  const recentChatbots = chatbots.slice(0, 5);

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
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ready': return 'is active and ready';
      case 'scraping': return 'is being scraped';
      case 'embedding': return 'is processing embeddings';
      case 'pending': return 'is pending';
      case 'failed': return 'failed to process';
      default: return status;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="pl-64 p-8">
        <div className="max-w-7xl mx-auto">
          <header className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
              <p className="text-muted-foreground">
                Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}!
              </p>
            </div>
          </header>

          <StatsCards stats={stats} isLoading={isLoading} />

          <div className="grid lg:grid-cols-3 gap-8">
            <GlassCard className="col-span-2 p-6 min-h-[400px]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold">Message Volume</h3>
                <div className="flex gap-2">
                  {[7, 14, 30].map((days) => (
                    <Button
                      key={days}
                      variant={selectedDays === days ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedDays(days)}
                    >
                      {days}d
                    </Button>
                  ))}
                </div>
              </div>
              <div className="h-[300px] w-full">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : stats.totalMessages === 0 && chartData.every(d => d.messages === 0) ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary">
                      <Bot className="h-8 w-8" />
                    </div>
                    <p className="text-muted-foreground mb-4">No conversations yet</p>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      Once your chatbots start receiving messages, you'll see the conversation volume here.
                    </p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" stroke="#525252" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#525252" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px' }}
                        itemStyle={{ color: '#fff' }}
                        labelFormatter={(label, payload) => {
                          if (payload && payload[0]?.payload?.date) {
                            return new Date(payload[0].payload.date).toLocaleDateString('en-US', {
                              weekday: 'long',
                              month: 'short',
                              day: 'numeric'
                            });
                          }
                          return label;
                        }}
                      />
                      <Area type="monotone" dataKey="messages" stroke="#8B5CF6" strokeWidth={3} fillOpacity={1} fill="url(#colorMessages)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
              {!isLoading && chartData.length > 0 && chartData.some(d => d.messages > 0) && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <span>
                    {chartData.reduce((sum, d) => sum + d.messages, 0)} messages in the last {selectedDays} days
                  </span>
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-6">
              <h3 className="text-lg font-semibold mb-6">Recent Activity</h3>
              {isLoading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : recentChatbots.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No chatbots yet</p>
                  <Link href="/dashboard/create">
                    <Button variant="outline" size="sm">Create your first chatbot</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-6">
                  {recentChatbots.map((bot) => (
                    <div key={bot.id} className="flex gap-4 items-start">
                      <div className={`h-2 w-2 mt-2 rounded-full shrink-0 ${
                        bot.status === 'ready' ? 'bg-green-400' : 
                        bot.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'
                      }`} />
                      <div>
                        <p className="text-sm">
                          <span className="font-medium">{bot.name}</span>{' '}
                          {getStatusText(bot.status)}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {getTimeAgo(bot.updated_at || bot.created_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      </main>
    </div>
  );
}
