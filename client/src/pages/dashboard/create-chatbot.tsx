import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/dashboard/sidebar";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Globe, Loader2, Sparkles, Code2, Copy, ExternalLink, Brain, HelpCircle, Info } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useChatbotStore, Chatbot } from "@/store/chatbot-store";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Confetti } from "@/components/ui/success-animation";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useScrapeStatus } from "@/hooks/useScrapeStatus";
import { ScrapeStatusBadge } from "@/components/dashboard/ScrapeStatusBadge";

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

const stepVariants = {
  enter: { opacity: 0, x: 50 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -50 },
};

export default function CreateChatbot() {
  const [step, setStep] = useState(1);
  const [url, setUrl] = useState("");
  const [chatbotName, setChatbotName] = useState("");
  const [selectedColor, setSelectedColor] = useState(colorOptions[0].value);
  const [welcomeMessage, setWelcomeMessage] = useState("Hello! How can I help you today?");
  const [personality, setPersonality] = useState(50);
  const [renderJavaScript, setRenderJavaScript] = useState(false);
  const [createdChatbot, setCreatedChatbot] = useState<Chatbot | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [copied, setCopied] = useState(false);

  const { createChatbot, isLoading, error, clearError } = useChatbotStore();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Poll scrape status for newly created chatbot
  const { status: scrapeStatus } = useScrapeStatus(
    createdChatbot?.id,
    { autoRefresh: !!createdChatbot }
  );

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
      showBranding: true,
      renderJavaScript,
    });

    if (chatbot) {
      setCreatedChatbot(chatbot);
      setStep(3);
      setShowConfetti(true);
      toast({
        title: "Success!",
        description: "Your chatbot is deployed and ready to use!",
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
    return `<script async src="${window.location.origin}/widget.js" data-chatbot-id="${createdChatbot.id}"></script>`;
  };

  const handleCopyEmbed = () => {
    navigator.clipboard.writeText(getEmbedCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Copied!",
      description: "Embed code copied to clipboard",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <Confetti show={showConfetti} />
      <main className="md:pl-64 px-4 md:px-8 pt-4 md:pt-8 pb-8">
        <div className="max-w-4xl mx-auto">
          <header className="mb-8 md:mb-12">
            <h1 className="text-2xl md:text-3xl font-bold mb-2">Create New Chatbot</h1>
            <p className="text-muted-foreground text-sm md:text-base">Train a new AI assistant on your website data</p>
          </header>

          {/* Stepper */}
          <div className="mb-8 md:mb-12">
            <div className="flex justify-between relative">
              <div className="absolute top-1/2 left-0 w-full h-1 bg-white/5 -z-10" />
              {steps.map((s) => (
                <div key={s.number} className="flex flex-col items-center gap-2 bg-background px-2 md:px-4">
                  <motion.div
                    initial={false}
                    animate={{
                      scale: step === s.number ? 1.1 : 1,
                      backgroundColor: step >= s.number ? "var(--primary)" : "var(--card)",
                    }}
                    transition={{ duration: 0.2 }}
                    className={`h-10 w-10 rounded-full flex items-center justify-center border-2 ${
                      step >= s.number
                        ? "border-primary text-white"
                        : "border-white/10 text-muted-foreground"
                    }`}
                  >
                    {step > s.number ? <Check className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
                  </motion.div>
                  <span className={`text-xs md:text-sm font-medium ${step >= s.number ? "text-foreground" : "text-muted-foreground"}`}>
                    {s.title}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <GlassCard className="p-4 md:p-8 min-h-[400px]">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="step1"
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3 }}
                  className="max-w-lg mx-auto py-8"
                >
                  <div className="text-center mb-8">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                      className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 text-primary"
                    >
                      <Globe className="h-8 w-8" />
                    </motion.div>
                    <h2 className="text-xl md:text-2xl font-bold mb-2">Connect Your Data Source</h2>
                    <p className="text-muted-foreground text-sm md:text-base">Enter your website URL to automatically crawl and train your chatbot.</p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <Input
                      placeholder="https://your-website.com"
                      className="h-12 bg-background/50 flex-1"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleContinue()}
                    />
                    <Button className="h-12 px-8 btn-gradient" onClick={handleContinue}>
                      Continue
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 text-center">
                    We'll scan up to 50 pages from your website to train the chatbot
                  </p>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step2"
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3 }}
                  className="grid md:grid-cols-2 gap-6 md:gap-8"
                >
                  <div className="space-y-5">
                    <div>
                      <Label className="mb-2 block">Chatbot Name</Label>
                      <Input
                        value={chatbotName}
                        onChange={(e) => setChatbotName(e.target.value)}
                        placeholder="My Support Bot"
                        className="bg-background/50"
                        maxLength={50}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {chatbotName.length}/50 characters
                      </p>
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
                      <div className="flex items-center gap-2 mb-2">
                        <Label>Primary Color</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Choose the main color for your widget header</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex gap-3">
                        {colorOptions.map((c) => (
                          <Tooltip key={c.value}>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => setSelectedColor(c.value)}
                                className={`h-8 w-8 rounded-full cursor-pointer ring-2 ring-offset-2 ring-offset-background ${c.class} ${
                                  selectedColor === c.value ? 'ring-white' : 'ring-transparent hover:ring-white/50'
                                }`}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{c.name}</p>
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Label>Welcome Message</Label>
                        <Tooltip>
                          <TooltipTrigger>
                            <HelpCircle className="h-4 w-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>The first message visitors see when opening the widget</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        value={welcomeMessage}
                        onChange={(e) => setWelcomeMessage(e.target.value)}
                        placeholder="Hello! How can I help you today?"
                        className="bg-background/50"
                        maxLength={200}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {welcomeMessage.length}/200 characters
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Label className="flex items-center gap-2">
                            <Brain className="h-4 w-4 text-purple-400" />
                            Personality Tone
                          </Label>
                          <Tooltip>
                            <TooltipTrigger>
                              <HelpCircle className="h-4 w-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[200px]">
                              <p>Controls how casual or formal your chatbot communicates</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
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

                    {/* SPA Rendering Toggle */}
                    <div className="flex items-center justify-between p-4 rounded-lg bg-background/50 border border-white/5">
                      <div className="space-y-0.5">
                        <Label>Render JavaScript (SPA)</Label>
                        <p className="text-xs text-muted-foreground">
                          Enable for React, Vue, Angular sites
                        </p>
                      </div>
                      <Switch
                        checked={renderJavaScript}
                        onCheckedChange={setRenderJavaScript}
                      />
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
                  <div className="border border-white/5 rounded-xl bg-background/50 p-4 md:p-6 flex items-center justify-center order-first md:order-last">
                    <div className="text-center w-full">
                      <p className="text-sm text-muted-foreground mb-4">Live Preview</p>
                      <div className="w-full max-w-[300px] mx-auto h-[350px] md:h-[400px] bg-card rounded-xl border border-white/10 shadow-2xl relative overflow-hidden flex flex-col">
                        <motion.div
                          animate={{ backgroundColor: selectedColor }}
                          className="p-4 text-white text-sm font-medium"
                        >
                          {chatbotName || 'Support Bot'}
                        </motion.div>
                        <div className="flex-1 p-4 bg-background/95">
                          <div className="bg-white/5 rounded-lg rounded-tl-none p-3 text-xs max-w-[80%] mb-2">
                            {welcomeMessage || "Hello! How can I help you?"}
                          </div>
                        </div>
                        <div className="p-3 border-t border-white/5">
                          <div className="h-8 bg-white/5 rounded w-full" />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 3 && createdChatbot && (
                <motion.div
                  key="step3"
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3 }}
                  className="max-w-2xl mx-auto text-center py-8"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                    className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.2, type: "spring", stiffness: 400 }}
                    >
                      <Check className="h-8 w-8 text-green-500" />
                    </motion.div>
                  </motion.div>
                  <h2 className="text-xl md:text-2xl font-bold mb-4">Chatbot Deployed Successfully!</h2>
                  <p className="text-muted-foreground mb-2 text-sm md:text-base">
                    Your chatbot "<span className="text-foreground font-medium">{createdChatbot.name}</span>" is <span className="text-green-400 font-medium">ready to use</span>!
                  </p>

                  {/* Scrape status badge */}
                  {scrapeStatus?.history[0] && (
                    <div className="flex justify-center mb-4">
                      <ScrapeStatusBadge
                        status={scrapeStatus.history[0].status}
                        pagesScraped={scrapeStatus.history[0].pages_scraped}
                        embeddingsCreated={scrapeStatus.history[0].embeddings_created}
                      />
                    </div>
                  )}

                  <p className="text-muted-foreground mb-8 text-sm md:text-base">
                    Copy the code below and paste it into your website's HTML to embed the chatbot.
                  </p>

                  <div className="relative bg-black/50 rounded-lg p-4 md:p-6 text-left font-mono text-xs md:text-sm border border-white/10 mb-8 group">
                    <code className="text-blue-400 break-all block overflow-x-auto">
                      {getEmbedCode()}
                    </code>
                    <Button
                      size="sm"
                      variant={copied ? "default" : "secondary"}
                      className="absolute top-2 right-2"
                      onClick={handleCopyEmbed}
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 mr-1" /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-1" /> Copy
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-8 text-left flex gap-3">
                    <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-blue-400">
                      <strong>Instant Deploy:</strong> Your chatbot is live right now! It will provide general assistance while learning about your website content (usually takes 5-10 minutes).
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row justify-center gap-4">
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
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>
        </div>
      </main>
    </div>
  );
}
