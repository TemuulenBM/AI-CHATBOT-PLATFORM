import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { GlassCard } from "@/components/ui/glass-card";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth, useUser } from "@clerk/clerk-react";
import { useChatbotStore, ChatbotComparisonItem } from "@/store/chatbot-store";
import { useLocation } from "wouter";
import { Bot, Loader2, TrendingUp, ThumbsUp, ThumbsDown, Smile, BarChart3, ExternalLink, Clock } from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Dashboard() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const { 
    stats, 
    fetchStats, 
    chatbots, 
    fetchChatbots, 
    messageVolume, 
    fetchMessageVolume,
    fetchChatbotComparison,
    chatbotComparison,
  } = useChatbotStore();
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDays, setSelectedDays] = useState(7);
  const [sentimentData, setSentimentData] = useState<any>(null);
  const [satisfactionData, setSatisfactionData] = useState<any>(null);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setLocation('/login');
      return;
    }

    if (isSignedIn) {
      const loadData = async () => {
        setIsLoading(true);
        await Promise.all([
          fetchStats(), 
          fetchChatbots(), 
          fetchMessageVolume(selectedDays),
          fetchChatbotComparison(),
        ]);

        // Fetch analytics for the first active chatbot if available
        const activeBot = chatbots.find(b => b.status === "ready");
        if (activeBot) {
          const { fetchSentimentBreakdown, fetchSatisfactionMetrics } = useChatbotStore.getState();
          const [sentiment, satisfaction] = await Promise.all([
            fetchSentimentBreakdown(activeBot.id),
            fetchSatisfactionMetrics(activeBot.id)
          ]);
          setSentimentData(sentiment);
          setSatisfactionData(satisfaction);
        }

        setIsLoading(false);
      };

      loadData();
    }
  }, [isLoaded, isSignedIn, selectedDays]);

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
                Welcome back{user?.firstName ? `, ${user.firstName}` : user?.emailAddresses?.[0]?.emailAddress ? `, ${user.emailAddresses[0].emailAddress.split('@')[0]}` : ''}!
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
                          <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
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
                      <div className={`h-2 w-2 mt-2 rounded-full shrink-0 ${bot.status === 'ready' ? 'bg-green-400' :
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

        {/* Chatbot Comparison Table */}
        {chatbotComparison.length > 0 && (
          <GlassCard className="p-6 mt-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Chatbot Performance Comparison
              </h3>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Chatbot</TableHead>
                      <TableHead className="text-right">Messages</TableHead>
                      <TableHead className="text-right">CSAT</TableHead>
                      <TableHead className="text-right">Avg Response</TableHead>
                      <TableHead className="text-right">Conv. Rate</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chatbotComparison.map((bot) => (
                      <TableRow key={bot.chatbotId}>
                        <TableCell className="font-medium">{bot.chatbotName}</TableCell>
                        <TableCell className="text-right">
                          {bot.totalMessages.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {bot.csatScore !== null ? (
                            <span className={`font-semibold ${
                              bot.csatScore >= 80 ? 'text-green-500' : 
                              bot.csatScore >= 60 ? 'text-amber-500' : 'text-red-500'
                            }`}>
                              {bot.csatScore}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {bot.avgResponseTimeMs !== null ? (
                            <span className="flex items-center justify-end gap-1">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              {bot.avgResponseTimeMs < 1000 
                                ? `${bot.avgResponseTimeMs}ms` 
                                : `${(bot.avgResponseTimeMs / 1000).toFixed(1)}s`}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {bot.conversionRate !== null ? (
                            <span className={`font-semibold ${
                              bot.conversionRate >= 30 ? 'text-green-500' : 
                              bot.conversionRate >= 15 ? 'text-amber-500' : 'text-muted-foreground'
                            }`}>
                              {bot.conversionRate}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/dashboard/chatbots/${bot.chatbotId}/analytics`}>
                            <Button variant="ghost" size="sm">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </GlassCard>
        )}

        <div className="grid lg:grid-cols-2 gap-8 mt-8">
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <Smile className="h-5 w-5 text-blue-400" />
              Sentiment Analysis
            </h3>
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : sentimentData && sentimentData.total > 0 ? (
              <div className="flex items-center justify-around">
                <div className="h-[200px] w-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Positive', value: sentimentData.positive },
                          { name: 'Neutral', value: sentimentData.neutral },
                          { name: 'Negative', value: sentimentData.negative },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        <Cell fill="#4ade80" />
                        <Cell fill="#94a3b8" />
                        <Cell fill="#f87171" />
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px' }}
                        itemStyle={{ color: '#fff' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-green-400" />
                    <div>
                      <div className="text-sm font-medium">Positive</div>
                      <div className="text-xs text-muted-foreground">{sentimentData.positiveRate}%</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-slate-400" />
                    <div>
                      <div className="text-sm font-medium">Neutral</div>
                      <div className="text-xs text-muted-foreground">
                        {Math.round((sentimentData.neutral / sentimentData.total) * 100)}%
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-400" />
                    <div>
                      <div className="text-sm font-medium">Negative</div>
                      <div className="text-xs text-muted-foreground">{sentimentData.negativeRate}%</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground">
                <Smile className="h-8 w-8 mb-2 opacity-20" />
                <p>No sentiment data available yet</p>
              </div>
            )}
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <ThumbsUp className="h-5 w-5 text-purple-400" />
              Customer Satisfaction (CSAT)
            </h3>
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : satisfactionData && satisfactionData.total > 0 ? (
              <div className="flex flex-col items-center justify-center h-48">
                <div className="text-5xl font-bold mb-2 text-primary">
                  {satisfactionData.satisfactionRate}%
                </div>
                <div className="text-muted-foreground mb-6">Satisfaction Rate</div>
                <div className="flex gap-8 w-full max-w-xs">
                  <div className="flex-1 text-center p-3 rounded-lg bg-green-400/10 border border-green-400/20">
                    <ThumbsUp className="h-5 w-5 mx-auto mb-1 text-green-400" />
                    <div className="font-bold text-green-400">{satisfactionData.positive}</div>
                    <div className="text-xs text-muted-foreground">Helpful</div>
                  </div>
                  <div className="flex-1 text-center p-3 rounded-lg bg-red-400/10 border border-red-400/20">
                    <ThumbsDown className="h-5 w-5 mx-auto mb-1 text-red-400" />
                    <div className="font-bold text-red-400">{satisfactionData.negative}</div>
                    <div className="text-xs text-muted-foreground">Unhelpful</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-center text-muted-foreground">
                <ThumbsUp className="h-8 w-8 mb-2 opacity-20" />
                <p>No feedback ratings yet</p>
              </div>
            )}
          </GlassCard>
        </div>
      </main>
    </div>
  );
}
