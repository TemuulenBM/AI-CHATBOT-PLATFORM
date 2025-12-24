import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Sidebar } from "@/components/dashboard/sidebar";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { useChatbotStore } from "@/store/chatbot-store";
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
} from "lucide-react";

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
    error,
    fetchChatbot,
    updateChatbot,
    clearCurrentChatbot,
    clearError,
  } = useChatbotStore();

  // Local form state
  const [name, setName] = useState("");
  const [personality, setPersonality] = useState(50);
  const [primaryColor, setPrimaryColor] = useState("#8B5CF6");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

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

  // Sync form state with chatbot data
  useEffect(() => {
    if (currentChatbot) {
      setName(currentChatbot.name || "");
      setPersonality(currentChatbot.settings?.personality ?? 50);
      setPrimaryColor(currentChatbot.settings?.primaryColor || "#8B5CF6");
      setWelcomeMessage(currentChatbot.settings?.welcomeMessage || "Hi! How can I help you today?");
      setSystemPrompt(currentChatbot.settings?.systemPrompt || "");
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
      systemPrompt !== (currentChatbot.settings?.systemPrompt || "");

    setHasChanges(changed);
  }, [name, personality, primaryColor, welcomeMessage, systemPrompt, currentChatbot]);

  const handleSave = async () => {
    if (!id || !hasChanges) return;

    const success = await updateChatbot(id, {
      name: name.trim(),
      settings: {
        personality,
        primaryColor,
        welcomeMessage: welcomeMessage.trim(),
        systemPrompt: systemPrompt.trim() || undefined,
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

  if (isLoading && !currentChatbot) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar />
        <main className="pl-64 p-8">
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
        <main className="pl-64 p-8">
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
      <main className="pl-64 p-8">
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

                  {/* Widget Preview */}
                  <div className="bg-background rounded-xl border border-white/10 shadow-2xl overflow-hidden">
                    {/* Header */}
                    <div
                      className="p-4 text-white flex items-center gap-3"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <span className="font-medium text-sm">{name || "Support Bot"}</span>
                    </div>

                    {/* Messages */}
                    <div className="p-4 min-h-[300px] bg-card/50">
                      <div className="bg-white/5 rounded-lg rounded-tl-none p-3 text-sm max-w-[85%] mb-3">
                        {welcomeMessage || "Hi! How can I help you today?"}
                      </div>
                      <div
                        className="rounded-lg rounded-tr-none p-3 text-sm max-w-[85%] ml-auto text-white"
                        style={{ backgroundColor: primaryColor }}
                      >
                        I have a question about your product.
                      </div>
                      <div className="bg-white/5 rounded-lg rounded-tl-none p-3 text-sm max-w-[85%] mt-3">
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
                        <div className="flex-1 h-9 bg-white/5 rounded-lg" />
                        <div
                          className="h-9 w-9 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: primaryColor }}
                        >
                          <svg
                            className="h-4 w-4 text-white"
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
                  </div>

                  {/* Personality Badge */}
                  <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/10">
                    <div className="flex items-center gap-2 text-sm">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="font-medium">{getPersonalityLabel(personality)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {getPersonalityDescription(personality)}
                    </p>
                  </div>
                </GlassCard>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
