import { useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Globe, Loader2, Sparkles, Code2, Copy, ExternalLink, Brain } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useChatbotStore, Chatbot } from "@/store/chatbot-store";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

const steps = [
  { number: 1, title: "Source", icon: Globe },
  { number: 2, title: "Customize", icon: Sparkles },
  { number: 3, title: "Install", icon: Code2 },
];

const colorOptions = [
  { name: 'Blue', value: '#3B82F6', class: 'bg-blue-500' },
  { name: 'Purple', value: '#8B5CF6', class: 'bg-purple-500' },
  { name: 'Green', value: '#22C55E', class: 'bg-green-500' },
  { name: 'Orange', value: '#F97316', class: 'bg-orange-500' },
];

function getPersonalityLabel(value: number): string {
  if (value <= 20) return "Very Professional";
  if (value <= 40) return "Professional";
  if (value <= 60) return "Balanced";
  if (value <= 80) return "Friendly";
  return "Very Casual";
}

export default function CreateChatbot() {
  const [step, setStep] = useState(1);
  const [url, setUrl] = useState("");
  const [chatbotName, setChatbotName] = useState("");
  const [selectedColor, setSelectedColor] = useState(colorOptions[0].value);
  const [welcomeMessage, setWelcomeMessage] = useState("Hello! How can I help you today?");
  const [personality, setPersonality] = useState(50);
  const [createdChatbot, setCreatedChatbot] = useState<Chatbot | null>(null);
  
  const { createChatbot, isLoading, error, clearError } = useChatbotStore();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const validateUrl = (urlString: string): boolean => {
    try {
      new URL(urlString);
      return true;
    } catch {
      return false;
    }
  };

  const handleContinue = () => {
    if (!url) {
      toast({
        title: "Error",
        description: "Please enter a valid URL",
        variant: "destructive",
      });
      return;
    }

    if (!validateUrl(url)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid website URL (e.g., https://example.com)",
        variant: "destructive",
      });
      return;
    }

    // Generate default name from URL
    try {
      const urlObj = new URL(url);
      const defaultName = urlObj.hostname.replace('www.', '').split('.')[0];
      setChatbotName(defaultName.charAt(0).toUpperCase() + defaultName.slice(1) + ' Bot');
    } catch {
      setChatbotName('My Chatbot');
    }

    setStep(2);
  };

  const handleCreate = async () => {
    if (!chatbotName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a name for your chatbot",
        variant: "destructive",
      });
      return;
    }

    clearError();

    const chatbot = await createChatbot(chatbotName.trim(), url, {
      personality,
      primaryColor: selectedColor,
      welcomeMessage: welcomeMessage.trim(),
    });
    
    if (chatbot) {
      setCreatedChatbot(chatbot);
      setStep(3);
      toast({
        title: "Success!",
        description: "Your chatbot is deployed and ready to use! Training on your website content in the background.",
      });
    } else {
      toast({
        title: "Error",
        description: error || "Failed to create chatbot",
        variant: "destructive",
      });
    }
  };

  const getEmbedCode = () => {
    if (!createdChatbot) return '';
    return `<script src="${window.location.origin}/widget.js" data-chatbot-id="${createdChatbot.id}"></script>`;
  };

  const handleCopyEmbed = () => {
    navigator.clipboard.writeText(getEmbedCode());
    toast({
      title: "Copied!",
      description: "Embed code copied to clipboard",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="pl-64 p-8">
        <div className="max-w-4xl mx-auto">
          <header className="mb-12">
            <h1 className="text-3xl font-bold mb-2">Create New Chatbot</h1>
            <p className="text-muted-foreground">Train a new AI assistant on your website data</p>
          </header>

          {/* Stepper */}
          <div className="mb-12">
            <div className="flex justify-between relative">
              <div className="absolute top-1/2 left-0 w-full h-1 bg-white/5 -z-10" />
              {steps.map((s) => (
                <div key={s.number} className="flex flex-col items-center gap-2 bg-background px-4">
                  <div 
                    className={`h-10 w-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                      step >= s.number 
                        ? "border-primary bg-primary text-white" 
                        : "border-white/10 bg-card text-muted-foreground"
                    }`}
                  >
                    {step > s.number ? <Check className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
                  </div>
                  <span className={`text-sm font-medium ${step >= s.number ? "text-foreground" : "text-muted-foreground"}`}>
                    {s.title}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <GlassCard className="p-8 min-h-[400px]">
            {step === 1 && (
              <div className="max-w-lg mx-auto py-8">
                <div className="text-center mb-8">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 text-primary">
                    <Globe className="h-8 w-8" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Connect Your Data Source</h2>
                  <p className="text-muted-foreground">Enter your website URL to automatically crawl and train your chatbot.</p>
                </div>

                <div className="flex gap-4">
                  <Input 
                    placeholder="https://your-website.com" 
                    className="h-12 bg-background/50"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                  <Button className="h-12 px-8 btn-gradient" onClick={handleContinue}>
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <Label className="mb-2 block">Chatbot Name</Label>
                    <Input 
                      value={chatbotName}
                      onChange={(e) => setChatbotName(e.target.value)}
                      placeholder="My Support Bot"
                      className="bg-background/50" 
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block">Website URL</Label>
                    <Input 
                      value={url}
                      disabled
                      className="bg-background/50 opacity-60" 
                    />
                  </div>
                  <div>
                    <Label className="mb-2 block">Primary Color</Label>
                    <div className="flex gap-3">
                      {colorOptions.map((c) => (
                        <button
                          key={c.value}
                          onClick={() => setSelectedColor(c.value)}
                          className={`h-8 w-8 rounded-full cursor-pointer ring-2 ring-offset-2 ring-offset-background ${c.class} ${
                            selectedColor === c.value ? 'ring-white' : 'ring-transparent hover:ring-white/50'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="mb-2 block">Welcome Message</Label>
                    <Input 
                      value={welcomeMessage}
                      onChange={(e) => setWelcomeMessage(e.target.value)}
                      placeholder="Hello! How can I help you today?"
                      className="bg-background/50" 
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="flex items-center gap-2">
                        <Brain className="h-4 w-4 text-purple-400" />
                        Personality Tone
                      </Label>
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
                  </div>
                  <Button 
                    className="w-full btn-gradient mt-4" 
                    onClick={handleCreate}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        Creating...
                      </>
                    ) : (
                      'Create Chatbot'
                    )}
                  </Button>
                  {error && (
                    <p className="text-sm text-red-400 text-center">{error}</p>
                  )}
                </div>
                <div className="border border-white/5 rounded-xl bg-background/50 p-6 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-4">Preview</p>
                    <div className="w-[300px] h-[400px] bg-card rounded-xl border border-white/10 shadow-2xl relative overflow-hidden flex flex-col">
                      <div 
                        className="p-4 text-white text-sm font-medium"
                        style={{ backgroundColor: selectedColor }}
                      >
                        {chatbotName || 'Support Bot'}
                      </div>
                      <div className="flex-1 p-4 bg-background/95">
                        <div className="bg-white/5 rounded-lg rounded-tl-none p-3 text-xs max-w-[80%] mb-2">
                          {welcomeMessage}
                        </div>
                      </div>
                      <div className="p-3 border-t border-white/5">
                        <div className="h-8 bg-white/5 rounded w-full" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && createdChatbot && (
              <div className="max-w-2xl mx-auto text-center py-8">
                <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6 text-green-500">
                  <Check className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-bold mb-4">Chatbot Deployed Successfully!</h2>
                <p className="text-muted-foreground mb-2">
                  Your chatbot "<span className="text-foreground font-medium">{createdChatbot.name}</span>" is <span className="text-green-400 font-medium">ready to use</span>!
                </p>
                <p className="text-muted-foreground mb-8">
                  It's learning about your website in the background. Copy the code below and paste it into your website's HTML.
                </p>

                <div className="relative bg-black/50 rounded-lg p-6 text-left font-mono text-sm border border-white/10 mb-8 group">
                  <code className="text-blue-400 break-all">
                    {getEmbedCode()}
                  </code>
                  <Button 
                    size="sm" 
                    variant="secondary" 
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={handleCopyEmbed}
                  >
                    <Copy className="h-4 w-4 mr-1" /> Copy
                  </Button>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-8 text-left">
                  <p className="text-sm text-blue-400">
                    <strong>Instant Deploy:</strong> Your chatbot is live right now! It will provide general assistance while learning about your website content (usually takes 5-10 minutes).
                    Responses will become more specific as training completes.
                  </p>
                </div>

                <div className="flex justify-center gap-4">
                  <Button variant="outline" onClick={() => setLocation("/dashboard/chatbots")}>
                    Go to Dashboard
                  </Button>
                  <Button 
                    className="btn-gradient gap-2"
                    onClick={() => window.open(`/widget/demo?id=${createdChatbot.id}`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" /> Test Widget
                  </Button>
                </div>
              </div>
            )}
          </GlassCard>
        </div>
      </main>
    </div>
  );
}
