import { useEffect, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { Sidebar } from "@/components/dashboard/sidebar";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useChatbotStore, ScrapeFrequency, ScrapeHistoryResponse } from "@/store/chatbot-store";
import { useAuth } from "@clerk/clerk-react";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Bot,
  Loader2,
  Save,
  Sparkles,
  Palette,
  MessageSquare,
  Brain,
  AlertCircle,
  ExternalLink,
  Layout,
  Type,
  Zap,
  RefreshCw,
  Database,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const colorOptions = [
  { name: "Blue", value: "#3B82F6", class: "bg-blue-500" },
  { name: "Purple", value: "#8B5CF6", class: "bg-purple-500" },
  { name: "Green", value: "#22C55E", class: "bg-green-500" },
  { name: "Orange", value: "#F97316", class: "bg-orange-500" },
  { name: "Pink", value: "#EC4899", class: "bg-pink-500" },
  { name: "Cyan", value: "#06B6D4", class: "bg-cyan-500" },
];

function getPersonalityLabel(value: number): string {
  if (value <= 20) return "Very Professional";
  if (value <= 40) return "Professional";
  if (value <= 60) return "Balanced";
  if (value <= 80) return "Friendly";
  return "Very Casual";
}

function getPersonalityDescription(value: number): string {
  if (value <= 20) return "Formal tone, business-focused responses";
  if (value <= 40) return "Professional but approachable";
  if (value <= 60) return "Balanced mix of professional and friendly";
  if (value <= 80) return "Warm, conversational, and helpful";
  return "Casual, fun, and very approachable";
}

export default function ChatbotSettings() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { isSignedIn, isLoaded } = useAuth();
  const { toast } = useToast();

  const {
    currentChatbot,
    isLoading,
    isSaving,
    isRescraping,
    error,
    fetchChatbot,
    updateChatbot,
    clearCurrentChatbot,
    clearError,
    triggerRescrape,
    updateScrapeSchedule,
    fetchScrapeHistory,
  } = useChatbotStore();

  // Local form state
  const [name, setName] = useState("");
  const [personality, setPersonality] = useState(50);
  const [primaryColor, setPrimaryColor] = useState("#8B5CF6");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");

  // New customization state
  const [position, setPosition] = useState<"bottom-right" | "bottom-left" | "bottom-center">("bottom-right");
  const [widgetSize, setWidgetSize] = useState<"compact" | "standard" | "large">("standard");
  const [borderRadius, setBorderRadius] = useState(12);
  const [fontFamily, setFontFamily] = useState("Inter");
  const [headerStyle, setHeaderStyle] = useState<"solid" | "gradient" | "glass">("gradient");
  const [showBranding, setShowBranding] = useState(true);
  const [openDelay, setOpenDelay] = useState(0);
  const [showInitially, setShowInitially] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [animationStyle, setAnimationStyle] = useState<"slide" | "fade" | "bounce" | "none">("slide");

  const [hasChanges, setHasChanges] = useState(false);

  // Re-scraping state
  const [scrapeHistory, setScrapeHistory] = useState<ScrapeHistoryResponse | null>(null);
  const [autoScrapeEnabled, setAutoScrapeEnabled] = useState(false);
  const [scrapeFrequency, setScrapeFrequency] = useState<ScrapeFrequency>("manual");
  const [showRescrapeDialog, setShowRescrapeDialog] = useState(false);

  // Auth check
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setLocation("/login");
    }
  }, [isLoaded, isSignedIn, setLocation]);

  // Fetch chatbot data
  useEffect(() => {
    if (id && isSignedIn) {
      fetchChatbot(id);
    }
    return () => {
      clearCurrentChatbot();
      clearError();
    };
  }, [id, isSignedIn]);

  // Fetch scrape history
  const loadScrapeHistory = useCallback(async () => {
    if (id) {
      const history = await fetchScrapeHistory(id);
      if (history) {
        setScrapeHistory(history);
        setAutoScrapeEnabled(history.autoScrapeEnabled);
        setScrapeFrequency(history.scrapeFrequency);
      }
    }
  }, [id, fetchScrapeHistory]);

  useEffect(() => {
    if (id && isSignedIn) {
      loadScrapeHistory();
    }
  }, [id, isSignedIn, loadScrapeHistory]);

  // Sync form state with chatbot data
  useEffect(() => {
    if (currentChatbot) {
      setName(currentChatbot.name || "");
      setPersonality(currentChatbot.settings?.personality ?? 50);
      setPrimaryColor(currentChatbot.settings?.primaryColor || "#8B5CF6");
      setWelcomeMessage(currentChatbot.settings?.welcomeMessage || "Hi! How can I help you today?");
      setSystemPrompt(currentChatbot.settings?.systemPrompt || "");

      // New customization settings
      setPosition(currentChatbot.settings?.position || "bottom-right");
      setWidgetSize(currentChatbot.settings?.widgetSize || "standard");
      setBorderRadius(currentChatbot.settings?.borderRadius ?? 12);
      setFontFamily(currentChatbot.settings?.fontFamily || "Inter");
      setHeaderStyle(currentChatbot.settings?.headerStyle || "gradient");
      setShowBranding(currentChatbot.settings?.showBranding ?? true);
      setOpenDelay(currentChatbot.settings?.openDelay ?? 0);
      setShowInitially(currentChatbot.settings?.showInitially ?? false);
      setSoundEnabled(currentChatbot.settings?.soundEnabled ?? true);
      setAnimationStyle(currentChatbot.settings?.animationStyle || "slide");

      setHasChanges(false);
    }
  }, [currentChatbot]);

  // Track changes
  useEffect(() => {
    if (!currentChatbot) return;

    const changed =
      name !== currentChatbot.name ||
      personality !== (currentChatbot.settings?.personality ?? 50) ||
      primaryColor !== (currentChatbot.settings?.primaryColor || "#8B5CF6") ||
      welcomeMessage !== (currentChatbot.settings?.welcomeMessage || "Hi! How can I help you today?") ||
      systemPrompt !== (currentChatbot.settings?.systemPrompt || "") ||
      position !== (currentChatbot.settings?.position || "bottom-right") ||
      widgetSize !== (currentChatbot.settings?.widgetSize || "standard") ||
      borderRadius !== (currentChatbot.settings?.borderRadius ?? 12) ||
      fontFamily !== (currentChatbot.settings?.fontFamily || "Inter") ||
      headerStyle !== (currentChatbot.settings?.headerStyle || "gradient") ||
      showBranding !== (currentChatbot.settings?.showBranding ?? true) ||
      openDelay !== (currentChatbot.settings?.openDelay ?? 0) ||
      showInitially !== (currentChatbot.settings?.showInitially ?? false) ||
      soundEnabled !== (currentChatbot.settings?.soundEnabled ?? true) ||
      animationStyle !== (currentChatbot.settings?.animationStyle || "slide");

    setHasChanges(changed);
  }, [name, personality, primaryColor, welcomeMessage, systemPrompt,
      position, widgetSize, borderRadius, fontFamily, headerStyle,
      showBranding, openDelay, showInitially, soundEnabled, animationStyle, currentChatbot]);

  const handleSave = async () => {
    if (!id || !hasChanges) return;

    const success = await updateChatbot(id, {
      name: name.trim(),
      settings: {
        personality,
        primaryColor,
        welcomeMessage: welcomeMessage.trim(),
        systemPrompt: systemPrompt.trim() || undefined,
        position,
        widgetSize,
        borderRadius,
        fontFamily,
        headerStyle,
        showBranding,
        openDelay,
        showInitially,
        soundEnabled,
        animationStyle,
      },
    });

    if (success) {
      toast({
        title: "Settings saved",
        description: "Your chatbot settings have been updated.",
      });
      setHasChanges(false);
    } else {
      toast({
        title: "Error",
        description: error || "Failed to save settings",
        variant: "destructive",
      });
    }
  };

  // Handle re-scrape confirmation
  const handleRescrape = async () => {
    if (!id) return;
    setShowRescrapeDialog(false);

    const result = await triggerRescrape(id);

    if (result.success) {
      toast({
        title: "Re-scraping started",
        description: "Your chatbot is being updated. This may take a few minutes.",
      });
      // Refresh history after a short delay
      setTimeout(() => loadScrapeHistory(), 2000);
    } else {
      toast({
        title: "Error",
        description: result.message,
        variant: "destructive",
      });
    }
  };

  // Handle schedule update
  const handleScheduleUpdate = async (enabled: boolean, frequency: ScrapeFrequency) => {
    if (!id) return;

    setAutoScrapeEnabled(enabled);
    setScrapeFrequency(frequency);

    const success = await updateScrapeSchedule(id, {
      autoScrapeEnabled: enabled,
      scrapeFrequency: frequency,
    });

    if (success) {
      toast({
        title: "Schedule updated",
        description: enabled
          ? `Auto re-scraping enabled (${frequency})`
          : "Auto re-scraping disabled",
      });
      loadScrapeHistory();
    } else {
      // Revert on failure
      if (scrapeHistory) {
        setAutoScrapeEnabled(scrapeHistory.autoScrapeEnabled);
        setScrapeFrequency(scrapeHistory.scrapeFrequency);
      }
      toast({
        title: "Error",
        description: "Failed to update schedule",
        variant: "destructive",
      });
    }
  };

  // Format relative time
  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    return date.toLocaleDateString();
  };

  // Format future date
  const formatFutureDate = (dateString: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (isLoading && !currentChatbot) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar />
        <main className="md:pl-64 px-4 md:px-8 pt-4 md:pt-8 pb-8">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  if (!currentChatbot && !isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar />
        <main className="md:pl-64 px-4 md:px-8 pt-4 md:pt-8 pb-8">
          <GlassCard className="p-12 text-center max-w-lg mx-auto">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Chatbot not found</h2>
            <p className="text-muted-foreground mb-6">
              The chatbot you're looking for doesn't exist or you don't have access.
            </p>
            <Button onClick={() => setLocation("/dashboard/chatbots")}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Chatbots
            </Button>
          </GlassCard>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="md:pl-64 px-4 md:px-8 pt-4 md:pt-8 pb-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <header className="mb-8">
            <Button
              variant="ghost"
              size="sm"
              className="mb-4 text-muted-foreground hover:text-foreground"
              onClick={() => setLocation("/dashboard/chatbots")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Chatbots
            </Button>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Bot className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{currentChatbot?.name}</h1>
                  <p className="text-sm text-muted-foreground">Customize your chatbot's personality and appearance</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => window.open(`/widget/demo?id=${id}`, "_blank")}
                >
                  <ExternalLink className="h-4 w-4 mr-2" /> Test Widget
                </Button>
                <Button
                  className="btn-gradient"
                  onClick={handleSave}
                  disabled={!hasChanges || isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" /> Save Changes
                    </>
                  )}
                </Button>
              </div>
            </div>
          </header>

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              {error}
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Settings Forms */}
            <div className="lg:col-span-2 space-y-6">
              {/* Basic Info */}
              <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold">Basic Information</h2>
                    <p className="text-sm text-muted-foreground">Name and identity of your chatbot</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label className="mb-2 block">Chatbot Name</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="My Support Bot"
                      className="bg-background/50"
                    />
                  </div>
                </div>
              </GlassCard>

              {/* Training Data & Content */}
              <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <Database className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold">Training Data & Content</h2>
                    <p className="text-sm text-muted-foreground">Manage your chatbot's knowledge base</p>
                  </div>
                </div>
                <div className="space-y-6">
                  {/* Training Stats */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 rounded-lg bg-background/50 border border-white/5">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Clock className="h-4 w-4" />
                        <span className="text-xs">Last Trained</span>
                      </div>
                      <p className="font-medium">
                        {formatRelativeTime(scrapeHistory?.lastScrapedAt || null)}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-background/50 border border-white/5">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Database className="h-4 w-4" />
                        <span className="text-xs">Embeddings</span>
                      </div>
                      <p className="font-medium">{currentChatbot?.stats?.embeddings || 0} chunks</p>
                    </div>
                    <div className="p-4 rounded-lg bg-background/50 border border-white/5">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <ExternalLink className="h-4 w-4" />
                        <span className="text-xs">Source</span>
                      </div>
                      <p className="font-medium text-xs truncate" title={currentChatbot?.website_url}>
                        {currentChatbot?.website_url ? new URL(currentChatbot.website_url).hostname : "N/A"}
                      </p>
                    </div>
                  </div>

                  {/* Re-scrape Button */}
                  <div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setShowRescrapeDialog(true)}
                      disabled={isRescraping}
                    >
                      {isRescraping ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Re-scraping in progress...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Re-scrape Website Now
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Automatic Re-scraping */}
                  <div className="space-y-4 pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Automatic Re-scraping</Label>
                        <p className="text-xs text-muted-foreground">Keep your chatbot's knowledge up-to-date</p>
                      </div>
                      <Switch
                        checked={autoScrapeEnabled}
                        onCheckedChange={(checked) => handleScheduleUpdate(checked, scrapeFrequency)}
                      />
                    </div>

                    {autoScrapeEnabled && (
                      <div>
                        <Label className="mb-2 block">Frequency</Label>
                        <Select
                          value={scrapeFrequency}
                          onValueChange={(value: ScrapeFrequency) => handleScheduleUpdate(autoScrapeEnabled, value)}
                        >
                          <SelectTrigger className="bg-background/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {autoScrapeEnabled && scrapeHistory?.nextScheduledScrape && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>Next scheduled: {formatFutureDate(scrapeHistory.nextScheduledScrape)}</span>
                      </div>
                    )}
                  </div>

                  {/* Recent Scrape History */}
                  {scrapeHistory?.history && scrapeHistory.history.length > 0 && (
                    <div className="space-y-3 pt-4 border-t border-white/5">
                      <Label>Recent History</Label>
                      <div className="space-y-2">
                        {scrapeHistory.history.slice(0, 3).map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-white/5"
                          >
                            <div className="flex items-center gap-3">
                              {entry.status === "completed" ? (
                                <CheckCircle2 className="h-4 w-4 text-green-400" />
                              ) : entry.status === "failed" ? (
                                <XCircle className="h-4 w-4 text-red-400" />
                              ) : (
                                <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
                              )}
                              <div>
                                <p className="text-sm font-medium capitalize">{entry.triggered_by} scrape</p>
                                <p className="text-xs text-muted-foreground">
                                  {entry.status === "completed"
                                    ? `${entry.pages_scraped} pages, ${entry.embeddings_created} embeddings`
                                    : entry.status === "failed"
                                    ? entry.error_message || "Failed"
                                    : "In progress..."}
                                </p>
                              </div>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatRelativeTime(entry.started_at)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </GlassCard>

              {/* AI Persona */}
              <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                    <Brain className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold">AI Persona</h2>
                    <p className="text-sm text-muted-foreground">Customize how your chatbot communicates</p>
                  </div>
                </div>
                <div className="space-y-6">
                  {/* Personality Slider */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label>Personality Tone</Label>
                      <span className="text-sm font-medium text-primary">
                        {getPersonalityLabel(personality)}
                      </span>
                    </div>
                    <Slider
                      value={[personality]}
                      onValueChange={(value) => setPersonality(value[0])}
                      max={100}
                      step={1}
                      className="mb-2"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Professional</span>
                      <span>Casual</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      {getPersonalityDescription(personality)}
                    </p>
                  </div>

                  {/* System Prompt */}
                  <div>
                    <Label className="mb-2 block">Custom Instructions (Optional)</Label>
                    <Textarea
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      placeholder="Add specific instructions for your chatbot. For example: 'Always greet users by name if provided. Focus on helping with product questions. Avoid discussing competitor products.'"
                      className="bg-background/50 min-h-[120px]"
                      maxLength={2000}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      {systemPrompt.length}/2000 characters. These instructions help shape how your chatbot responds.
                    </p>
                  </div>
                </div>
              </GlassCard>

              {/* Widget Appearance */}
              <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-400">
                    <Palette className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold">Widget Appearance</h2>
                    <p className="text-sm text-muted-foreground">Customize the look of your chat widget</p>
                  </div>
                </div>
                <div className="space-y-6">
                  {/* Color Picker */}
                  <div>
                    <Label className="mb-3 block">Primary Color</Label>
                    <div className="flex gap-3">
                      {colorOptions.map((c) => (
                        <button
                          key={c.value}
                          onClick={() => setPrimaryColor(c.value)}
                          className={`h-10 w-10 rounded-full cursor-pointer ring-2 ring-offset-2 ring-offset-background transition-all ${c.class} ${
                            primaryColor === c.value
                              ? "ring-white scale-110"
                              : "ring-transparent hover:ring-white/50"
                          }`}
                          title={c.name}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Welcome Message */}
                  <div>
                    <Label className="mb-2 block">Welcome Message</Label>
                    <Input
                      value={welcomeMessage}
                      onChange={(e) => setWelcomeMessage(e.target.value)}
                      placeholder="Hi! How can I help you today?"
                      className="bg-background/50"
                      maxLength={500}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      The first message users see when they open the chat widget.
                    </p>
                  </div>
                </div>
              </GlassCard>

              {/* Widget Layout */}
              <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                    <Layout className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold">Widget Layout</h2>
                    <p className="text-sm text-muted-foreground">Configure position and size</p>
                  </div>
                </div>
                <div className="space-y-6">
                  {/* Position */}
                  <div>
                    <Label className="mb-3 block">Position on Page</Label>
                    <RadioGroup value={position} onValueChange={(value: any) => setPosition(value)}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="bottom-right" id="bottom-right" />
                        <Label htmlFor="bottom-right" className="font-normal cursor-pointer">Bottom Right</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="bottom-left" id="bottom-left" />
                        <Label htmlFor="bottom-left" className="font-normal cursor-pointer">Bottom Left</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="bottom-center" id="bottom-center" />
                        <Label htmlFor="bottom-center" className="font-normal cursor-pointer">Bottom Center</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Widget Size */}
                  <div>
                    <Label className="mb-3 block">Widget Size</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={widgetSize === "compact" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setWidgetSize("compact")}
                      >
                        Compact
                      </Button>
                      <Button
                        type="button"
                        variant={widgetSize === "standard" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setWidgetSize("standard")}
                      >
                        Standard
                      </Button>
                      <Button
                        type="button"
                        variant={widgetSize === "large" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setWidgetSize("large")}
                      >
                        Large
                      </Button>
                    </div>
                  </div>

                  {/* Border Radius */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label>Corner Radius</Label>
                      <span className="text-sm font-medium text-primary">{borderRadius}px</span>
                    </div>
                    <Slider
                      value={[borderRadius]}
                      onValueChange={(value) => setBorderRadius(value[0])}
                      max={24}
                      step={1}
                      className="mb-2"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Square</span>
                      <span>Rounded</span>
                    </div>
                  </div>
                </div>
              </GlassCard>

              {/* Typography & Style */}
              <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                    <Type className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold">Typography & Style</h2>
                    <p className="text-sm text-muted-foreground">Customize fonts and header style</p>
                  </div>
                </div>
                <div className="space-y-6">
                  {/* Font Family */}
                  <div>
                    <Label className="mb-2 block">Font Family</Label>
                    <Select value={fontFamily} onValueChange={setFontFamily}>
                      <SelectTrigger className="bg-background/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Inter">Inter</SelectItem>
                        <SelectItem value="Roboto">Roboto</SelectItem>
                        <SelectItem value="Open Sans">Open Sans</SelectItem>
                        <SelectItem value="Lato">Lato</SelectItem>
                        <SelectItem value="Poppins">Poppins</SelectItem>
                        <SelectItem value="Montserrat">Montserrat</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Header Style */}
                  <div>
                    <Label className="mb-3 block">Header Style</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={headerStyle === "solid" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setHeaderStyle("solid")}
                      >
                        Solid
                      </Button>
                      <Button
                        type="button"
                        variant={headerStyle === "gradient" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setHeaderStyle("gradient")}
                      >
                        Gradient
                      </Button>
                      <Button
                        type="button"
                        variant={headerStyle === "glass" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setHeaderStyle("glass")}
                      >
                        Glass
                      </Button>
                    </div>
                  </div>

                  {/* Show Branding */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Show "Powered by ConvoAI"</Label>
                      <p className="text-xs text-muted-foreground">Display branding in widget footer</p>
                    </div>
                    <Switch checked={showBranding} onCheckedChange={setShowBranding} />
                  </div>
                </div>
              </GlassCard>

              {/* Behavior Settings */}
              <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold">Behavior</h2>
                    <p className="text-sm text-muted-foreground">Configure widget behavior</p>
                  </div>
                </div>
                <div className="space-y-6">
                  {/* Auto-open Delay */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label>Auto-open Delay</Label>
                      <span className="text-sm font-medium text-primary">
                        {openDelay === 0 ? "Disabled" : `${openDelay}s`}
                      </span>
                    </div>
                    <Slider
                      value={[openDelay]}
                      onValueChange={(value) => setOpenDelay(value[0])}
                      max={30}
                      step={1}
                      className="mb-2"
                    />
                    <p className="text-xs text-muted-foreground">
                      {openDelay === 0
                        ? "Widget will not auto-open"
                        : `Widget will open automatically after ${openDelay} seconds`}
                    </p>
                  </div>

                  {/* Start Expanded */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Start Expanded</Label>
                      <p className="text-xs text-muted-foreground">Open widget by default on page load</p>
                    </div>
                    <Switch checked={showInitially} onCheckedChange={setShowInitially} />
                  </div>

                  {/* Sound Enabled */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable Sound Notifications</Label>
                      <p className="text-xs text-muted-foreground">Play sound when new messages arrive</p>
                    </div>
                    <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
                  </div>

                  {/* Animation Style */}
                  <div>
                    <Label className="mb-3 block">Animation Style</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={animationStyle === "slide" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setAnimationStyle("slide")}
                      >
                        Slide
                      </Button>
                      <Button
                        type="button"
                        variant={animationStyle === "fade" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setAnimationStyle("fade")}
                      >
                        Fade
                      </Button>
                      <Button
                        type="button"
                        variant={animationStyle === "bounce" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setAnimationStyle("bounce")}
                      >
                        Bounce
                      </Button>
                      <Button
                        type="button"
                        variant={animationStyle === "none" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setAnimationStyle("none")}
                      >
                        None
                      </Button>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </div>

            {/* Live Preview */}
            <div className="lg:col-span-1">
              <div className="sticky top-8">
                <GlassCard className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
                      <MessageSquare className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-semibold">Live Preview</h2>
                      <p className="text-sm text-muted-foreground">See your changes in real-time</p>
                    </div>
                  </div>

                  {/* Size Preview Info */}
                  <div className="mb-4 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Preview Size: {widgetSize}</span>
                    <span className="text-muted-foreground">Position: {position}</span>
                  </div>

                  {/* Widget Preview */}
                  <div
                    className={`bg-background border border-white/10 shadow-2xl overflow-hidden transition-all duration-300 ${
                      widgetSize === "compact" ? "max-w-[280px]" :
                      widgetSize === "large" ? "max-w-[420px]" : "max-w-[350px]"
                    }`}
                    style={{
                      borderRadius: `${borderRadius}px`,
                      fontFamily: fontFamily
                    }}
                  >
                    {/* Header */}
                    <div
                      className={`p-4 text-white flex items-center gap-3 ${
                        headerStyle === "gradient" ? "bg-gradient-to-r from-purple-600 to-blue-600" :
                        headerStyle === "glass" ? "backdrop-blur-lg bg-white/10" : ""
                      }`}
                      style={{
                        backgroundColor: headerStyle === "solid" ? primaryColor : undefined
                      }}
                    >
                      <div className={`h-8 w-8 rounded-full bg-white/20 flex items-center justify-center ${
                        headerStyle === "glass" ? "backdrop-blur-sm" : ""
                      }`}>
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <span className={`font-medium ${
                        widgetSize === "compact" ? "text-xs" :
                        widgetSize === "large" ? "text-base" : "text-sm"
                      }`}>{name || "Support Bot"}</span>
                    </div>

                    {/* Messages */}
                    <div className={`p-4 bg-card/50 ${
                      widgetSize === "compact" ? "min-h-[240px]" :
                      widgetSize === "large" ? "min-h-[360px]" : "min-h-[300px]"
                    }`}>
                      <div
                        className={`bg-white/5 p-3 max-w-[85%] mb-3 ${
                          widgetSize === "compact" ? "text-xs" :
                          widgetSize === "large" ? "text-base" : "text-sm"
                        }`}
                        style={{
                          borderRadius: `${Math.max(borderRadius - 4, 4)}px`,
                          borderTopLeftRadius: '4px'
                        }}
                      >
                        {welcomeMessage || "Hi! How can I help you today?"}
                      </div>
                      <div
                        className={`p-3 max-w-[85%] ml-auto text-white ${
                          widgetSize === "compact" ? "text-xs" :
                          widgetSize === "large" ? "text-base" : "text-sm"
                        }`}
                        style={{
                          backgroundColor: primaryColor,
                          borderRadius: `${Math.max(borderRadius - 4, 4)}px`,
                          borderTopRightRadius: '4px'
                        }}
                      >
                        I have a question about your product.
                      </div>
                      <div
                        className={`bg-white/5 p-3 max-w-[85%] mt-3 ${
                          widgetSize === "compact" ? "text-xs" :
                          widgetSize === "large" ? "text-base" : "text-sm"
                        }`}
                        style={{
                          borderRadius: `${Math.max(borderRadius - 4, 4)}px`,
                          borderTopLeftRadius: '4px'
                        }}
                      >
                        {personality <= 40
                          ? "Thank you for your inquiry. I'd be happy to assist you with any product-related questions."
                          : personality <= 60
                          ? "Of course! I'm here to help. What would you like to know?"
                          : "Hey, great question! I'd love to help you out! What do you want to know? 😊"}
                      </div>
                    </div>

                    {/* Input */}
                    <div className="p-3 border-t border-white/5">
                      <div className="flex gap-2">
                        <div
                          className={`flex-1 bg-white/5 ${
                            widgetSize === "compact" ? "h-8" :
                            widgetSize === "large" ? "h-11" : "h-9"
                          }`}
                          style={{ borderRadius: `${Math.max(borderRadius - 4, 4)}px` }}
                        />
                        <div
                          className={`flex items-center justify-center ${
                            widgetSize === "compact" ? "h-8 w-8" :
                            widgetSize === "large" ? "h-11 w-11" : "h-9 w-9"
                          }`}
                          style={{
                            backgroundColor: primaryColor,
                            borderRadius: `${Math.max(borderRadius - 4, 4)}px`
                          }}
                        >
                          <svg
                            className={widgetSize === "compact" ? "h-3 w-3" :
                                      widgetSize === "large" ? "h-5 w-5" : "h-4 w-4"}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Branding Footer */}
                    {showBranding && (
                      <div className="px-3 py-2 border-t border-white/5 bg-card/30">
                        <p className="text-[10px] text-center text-muted-foreground">
                          Powered by <span className="font-medium">ConvoAI</span>
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Customization Info Cards */}
                  <div className="mt-4 space-y-2">
                    {/* Personality Badge */}
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                      <div className="flex items-center gap-2 text-sm">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="font-medium">{getPersonalityLabel(personality)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {getPersonalityDescription(personality)}
                      </p>
                    </div>

                    {/* Animation Info */}
                    <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
                      <div className="flex items-center gap-2 text-sm">
                        <Zap className="h-4 w-4 text-blue-400" />
                        <span className="font-medium">Animation: {animationStyle}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {openDelay > 0 && `Auto-opens after ${openDelay}s • `}
                        {showInitially ? "Starts expanded" : "Starts minimized"}
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Re-scrape Confirmation Dialog */}
      <Dialog open={showRescrapeDialog} onOpenChange={setShowRescrapeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-scrape Website</DialogTitle>
            <DialogDescription>
              This will update your chatbot's knowledge by re-scraping your website. The process may take a few minutes depending on the number of pages.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-yellow-500">Important</p>
                <p className="text-muted-foreground mt-1">
                  Your chatbot will continue working during the re-scrape. Once complete, it will automatically use the updated content.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRescrapeDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRescrape} className="btn-gradient">
              <RefreshCw className="h-4 w-4 mr-2" />
              Start Re-scraping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
