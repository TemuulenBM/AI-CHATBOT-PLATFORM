import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { useAuth } from "@clerk/clerk-react";
import { 
  useChatbotStore, 
  ConversationRateMetrics, 
  ResponseTimeTrendPoint,
  WidgetAnalyticsSummary 
} from "@/store/chatbot-store";
import { useLocation } from "wouter";
import { 
  ArrowLeft,
  Clock, 
  Download, 
  Eye, 
  Loader2, 
  MessageSquare, 
  MousePointer,
  TrendingUp,
  Users,
  BarChart3,
  FileJson,
  FileSpreadsheet,
} from "lucide-react";
import { Link, useParams } from "wouter";

export default function Analytics() {
  const { isSignedIn, isLoaded } = useAuth();
  const params = useParams<{ id: string }>();
  const chatbotId = params?.id;
  const { 
    chatbots, 
    fetchChatbots, 
    fetchChatbot,
    currentChatbot,
    fetchConversationRate,
    fetchResponseTimeTrends,
    fetchWidgetAnalytics,
    exportAnalytics,
    isExporting,
  } = useChatbotStore();
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDays, setSelectedDays] = useState(7);

  // Analytics data
  const [conversionRate, setConversionRate] = useState<ConversationRateMetrics | null>(null);
  const [responseTimeTrends, setResponseTimeTrends] = useState<ResponseTimeTrendPoint[]>([]);
  const [widgetAnalytics, setWidgetAnalytics] = useState<WidgetAnalyticsSummary | null>(null);

  // Export dialog state
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [exportStartDate, setExportStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  });
  const [exportEndDate, setExportEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [exportIncludeConversations, setExportIncludeConversations] = useState(true);
  const [exportIncludeMessages, setExportIncludeMessages] = useState(true);
  const [exportIncludeRatings, setExportIncludeRatings] = useState(true);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setLocation('/login');
      return;
    }

    if (isSignedIn && chatbotId) {
      const loadData = async () => {
        setIsLoading(true);
        await fetchChatbots();
        await fetchChatbot(chatbotId);

        const [conversion, trends, widget] = await Promise.all([
          fetchConversationRate(chatbotId, selectedDays),
          fetchResponseTimeTrends(chatbotId, selectedDays),
          fetchWidgetAnalytics(chatbotId, selectedDays),
        ]);

        setConversionRate(conversion);
        setResponseTimeTrends(trends || []);
        setWidgetAnalytics(widget);
        setIsLoading(false);
      };

      loadData();
    }
  }, [isLoaded, isSignedIn, chatbotId, selectedDays]);

  const handleExport = async () => {
    if (!chatbotId) return;
    
    const success = await exportAnalytics(chatbotId, {
      format: exportFormat,
      startDate: exportStartDate,
      endDate: exportEndDate,
      includeConversations: exportIncludeConversations,
      includeMessages: exportIncludeMessages,
      includeRatings: exportIncludeRatings,
    });

    if (success) {
      setExportDialogOpen(false);
    }
  };

  // Format chart data
  const formatResponseTimeData = () => {
    return responseTimeTrends.map((point) => {
      const date = new Date(point.date);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      return {
        name: dayName,
        date: point.date,
        responseTime: point.avgResponseTimeMs ? Math.round(point.avgResponseTimeMs) : 0,
        messages: point.messageCount,
      };
    });
  };

  const formatWidgetData = () => {
    if (!widgetAnalytics) return [];
    return widgetAnalytics.dailyViews.map((point) => {
      const date = new Date(point.date);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      return {
        name: dayName,
        date: point.date,
        views: point.views,
        opens: point.opens,
        messages: point.messages,
      };
    });
  };

  const responseTimeData = formatResponseTimeData();
  const widgetData = formatWidgetData();

  const formatMs = (ms: number | null) => {
    if (ms === null) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="pl-64 p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <header className="mb-8">
            <Link href="/dashboard/chatbots">
              <Button variant="ghost" size="sm" className="mb-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Chatbots
              </Button>
            </Link>
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold mb-2">
                  {currentChatbot?.name || 'Chatbot'} Analytics
                </h1>
                <p className="text-muted-foreground">
                  Detailed analytics and performance metrics
                </p>
              </div>
              <div className="flex gap-4 items-center">
                <Select 
                  value={selectedDays.toString()} 
                  onValueChange={(v) => setSelectedDays(parseInt(v))}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="14">Last 14 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                  </SelectContent>
                </Select>

                <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Download className="h-4 w-4 mr-2" />
                      Export Data
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Export Analytics Data</DialogTitle>
                      <DialogDescription>
                        Download your analytics data in CSV or JSON format.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                      {/* Date Range */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="startDate">Start Date</Label>
                          <Input
                            id="startDate"
                            type="date"
                            value={exportStartDate}
                            onChange={(e) => setExportStartDate(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="endDate">End Date</Label>
                          <Input
                            id="endDate"
                            type="date"
                            value={exportEndDate}
                            onChange={(e) => setExportEndDate(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Format Selection */}
                      <div className="space-y-2">
                        <Label>Export Format</Label>
                        <div className="flex gap-4">
                          <Button
                            type="button"
                            variant={exportFormat === 'csv' ? 'default' : 'outline'}
                            onClick={() => setExportFormat('csv')}
                            className="flex-1"
                          >
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            CSV
                          </Button>
                          <Button
                            type="button"
                            variant={exportFormat === 'json' ? 'default' : 'outline'}
                            onClick={() => setExportFormat('json')}
                            className="flex-1"
                          >
                            <FileJson className="h-4 w-4 mr-2" />
                            JSON
                          </Button>
                        </div>
                      </div>

                      {/* Include Options */}
                      <div className="space-y-3">
                        <Label>Include in Export</Label>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="conversations"
                            checked={exportIncludeConversations}
                            onCheckedChange={(c) => setExportIncludeConversations(!!c)}
                          />
                          <Label htmlFor="conversations" className="font-normal">
                            Conversations
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="messages"
                            checked={exportIncludeMessages}
                            onCheckedChange={(c) => setExportIncludeMessages(!!c)}
                          />
                          <Label htmlFor="messages" className="font-normal">
                            Messages
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="ratings"
                            checked={exportIncludeRatings}
                            onCheckedChange={(c) => setExportIncludeRatings(!!c)}
                          />
                          <Label htmlFor="ratings" className="font-normal">
                            Ratings
                          </Label>
                        </div>
                      </div>
                    </div>

                    <DialogFooter>
                      <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleExport} disabled={isExporting}>
                        {isExporting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Exporting...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </header>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Conversion Rate Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <Eye className="h-5 w-5 text-blue-500" />
                    </div>
                    <span className="text-sm text-muted-foreground">Widget Views</span>
                  </div>
                  <div className="text-3xl font-bold">
                    {conversionRate?.widgetViews.toLocaleString() || 0}
                  </div>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <MousePointer className="h-5 w-5 text-green-500" />
                    </div>
                    <span className="text-sm text-muted-foreground">Widget Opens</span>
                  </div>
                  <div className="text-3xl font-bold">
                    {conversionRate?.widgetOpens.toLocaleString() || 0}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {conversionRate?.openRate || 0}% open rate
                  </div>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                      <MessageSquare className="h-5 w-5 text-purple-500" />
                    </div>
                    <span className="text-sm text-muted-foreground">Conversations</span>
                  </div>
                  <div className="text-3xl font-bold">
                    {conversionRate?.conversationsStarted.toLocaleString() || 0}
                  </div>
                </GlassCard>

                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-amber-500" />
                    </div>
                    <span className="text-sm text-muted-foreground">Conversion Rate</span>
                  </div>
                  <div className="text-3xl font-bold text-primary">
                    {conversionRate?.conversionRate || 0}%
                  </div>
                </GlassCard>
              </div>

              {/* Charts Grid */}
              <div className="grid lg:grid-cols-2 gap-8 mb-8">
                {/* Response Time Trends */}
                <GlassCard className="p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Clock className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">Response Time Trends</h3>
                  </div>
                  <div className="h-[300px]">
                    {responseTimeData.length > 0 && responseTimeData.some(d => d.responseTime > 0) ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={responseTimeData}>
                          <defs>
                            <linearGradient id="colorRT" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis 
                            dataKey="name" 
                            stroke="#525252" 
                            fontSize={12} 
                            tickLine={false} 
                            axisLine={false} 
                          />
                          <YAxis 
                            stroke="#525252" 
                            fontSize={12} 
                            tickLine={false} 
                            axisLine={false}
                            tickFormatter={(value) => `${value}ms`}
                          />
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
                            formatter={(value: number) => [`${value}ms`, 'Avg Response Time']}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="responseTime" 
                            stroke="#10b981" 
                            strokeWidth={3}
                            dot={{ fill: '#10b981', strokeWidth: 2 }}
                            activeDot={{ r: 6 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-center">
                        <Clock className="h-12 w-12 text-muted-foreground/20 mb-4" />
                        <p className="text-muted-foreground">No response time data available</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Data will appear once your chatbot handles conversations
                        </p>
                      </div>
                    )}
                  </div>
                </GlassCard>

                {/* Widget Activity */}
                <GlassCard className="p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">Widget Activity</h3>
                  </div>
                  <div className="h-[300px]">
                    {widgetData.length > 0 && widgetData.some(d => d.views > 0 || d.opens > 0 || d.messages > 0) ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={widgetData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis 
                            dataKey="name" 
                            stroke="#525252" 
                            fontSize={12} 
                            tickLine={false} 
                            axisLine={false} 
                          />
                          <YAxis 
                            stroke="#525252" 
                            fontSize={12} 
                            tickLine={false} 
                            axisLine={false}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px' }}
                            itemStyle={{ color: '#fff' }}
                          />
                          <Legend />
                          <Bar dataKey="views" name="Views" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="opens" name="Opens" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="messages" name="Messages" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-center">
                        <BarChart3 className="h-12 w-12 text-muted-foreground/20 mb-4" />
                        <p className="text-muted-foreground">No widget activity data yet</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Install the widget on your website to start tracking
                        </p>
                      </div>
                    )}
                  </div>
                </GlassCard>
              </div>

              {/* Widget Summary */}
              {widgetAnalytics && (
                <GlassCard className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Widget Summary</h3>
                  <div className="grid grid-cols-3 gap-8">
                    <div className="text-center p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
                      <div className="text-4xl font-bold text-blue-500 mb-2">
                        {widgetAnalytics.totalViews.toLocaleString()}
                      </div>
                      <div className="text-muted-foreground">Total Views</div>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-green-500/5 border border-green-500/20">
                      <div className="text-4xl font-bold text-green-500 mb-2">
                        {widgetAnalytics.totalOpens.toLocaleString()}
                      </div>
                      <div className="text-muted-foreground">Total Opens</div>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-purple-500/5 border border-purple-500/20">
                      <div className="text-4xl font-bold text-purple-500 mb-2">
                        {widgetAnalytics.totalMessages.toLocaleString()}
                      </div>
                      <div className="text-muted-foreground">Total Messages</div>
                    </div>
                  </div>
                </GlassCard>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

