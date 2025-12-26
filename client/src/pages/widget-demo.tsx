import { useEffect, useState, useRef } from "react";
import { useSearch } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageSquare,
  Play,
  Pause,
  RotateCcw,
  Copy,
  Check,
  ExternalLink,
  Shield,
  Zap,
  Globe,
  Code,
  Smartphone,
  Monitor,
  Bot,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { Link } from "wouter";

// Production backend URL for code examples shown to users
const PRODUCTION_URL = "https://ai-chatbot-platform-iiuf.onrender.com";

// Get the actual backend URL for loading the widget (localhost or production)
function getBackendUrl() {
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return window.location.origin;
  }
  return import.meta.env.VITE_API_URL || PRODUCTION_URL;
}

const features = [
  {
    icon: Shield,
    title: "Shadow DOM",
    description: "Complete style isolation - your styles won't affect the widget",
  },
  {
    icon: Zap,
    title: "Async Loading",
    description: "Non-blocking script that won't slow down your site",
  },
  {
    icon: Globe,
    title: "i18n Ready",
    description: "Multi-language support out of the box",
  },
  {
    icon: Code,
    title: "JavaScript API",
    description: "Full programmatic control over the widget",
  },
];

// Code examples use production URL (what users should copy)
function getCodeExamples(chatbotId: string) {
  return {
    basic: `<!-- Add before </body> -->
<script async
  src="${PRODUCTION_URL}/widget.js"
  data-chatbot-id="${chatbotId}"
></script>`,
    advanced: `<!-- Advanced configuration -->
<script async
  src="${PRODUCTION_URL}/widget.js"
  data-chatbot-id="${chatbotId}"
  data-position="bottom-right"
  data-locale="en"
></script>

<!-- JavaScript API -->
<script>
  // Open/close programmatically
  ConvoAI('open');
  ConvoAI('close');
  ConvoAI('toggle');

  // Send messages
  ConvoAI('sendMessage', 'Hello!');

  // Identify users
  ConvoAI('identify', {
    name: 'John Doe',
    email: 'john@example.com'
  });

  // Listen to events
  ConvoAI('on', 'message', (data) => {
    console.log('New message:', data);
  });
</script>`,
    react: `import { useEffect } from 'react';

function App() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = '${PRODUCTION_URL}/widget.js';
    script.async = true;
    script.setAttribute('data-chatbot-id', '${chatbotId}');
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return <div>Your App</div>;
}`,
  };
}

export default function WidgetDemo() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const chatbotId = params.get("id") || "demo-chatbot-id";

  const [widgetLoaded, setWidgetLoaded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState("basic");
  const widgetRef = useRef<HTMLScriptElement | null>(null);

  // Get code examples with the chatbot ID
  const codeExamples = getCodeExamples(chatbotId);

  // Load the widget - only once on mount
  useEffect(() => {
    // Prevent double-loading in React Strict Mode
    if (widgetRef.current) {
      return;
    }

    // Check if widget script is already in DOM
    const existingScript = document.querySelector(`script[src*="widget.js"]`);
    if (existingScript) {
      widgetRef.current = existingScript as HTMLScriptElement;
      setWidgetLoaded(true);
      return;
    }

    // Check if widget host already exists (widget already initialized)
    if (document.getElementById("convoai-widget-host")) {
      setWidgetLoaded(true);
      return;
    }

    const backendUrl = getBackendUrl();
    const script = document.createElement("script");
    script.src = `${backendUrl}/widget.js`;
    script.async = true;
    script.setAttribute("data-chatbot-id", chatbotId);

    // Mark ref immediately to prevent double-load
    widgetRef.current = script;

    document.body.appendChild(script);

    script.onload = () => {
      setWidgetLoaded(true);
    };

    // Cleanup only on actual unmount
    return () => {
      // Don't clean up if we're just re-running due to Strict Mode
      // The widget should persist until actual navigation away
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on mount

  // Separate cleanup effect for unmount only
  useEffect(() => {
    return () => {
      // This runs only on actual unmount
      if ((window as any).ConvoAI) {
        (window as any).ConvoAI('destroy');
      }
      const host = document.getElementById("convoai-widget-host");
      if (host) {
        host.remove();
      }
      const scriptEl = document.querySelector(`script[src*="widget.js"]`);
      if (scriptEl) {
        scriptEl.remove();
      }
      widgetRef.current = null;
    };
  }, []);

  const handleWidgetAction = (action: string) => {
    if ((window as any).ConvoAI) {
      (window as any).ConvoAI(action);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Gradient Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-secondary/20" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/30 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary/30 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="border-b border-white/5 bg-background/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white">
              <Bot className="h-5 w-5" />
            </div>
            <span>ConvoAI</span>
          </Link>
          <div className="flex items-center gap-4">
            <Badge variant="secondary" className="hidden sm:flex">
              <Sparkles className="h-3 w-3 mr-1" />
              Widget v2.0
            </Badge>
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                Dashboard
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-6xl mx-auto space-y-12"
        >
          {/* Hero Section */}
          <motion.div variants={itemVariants} className="text-center space-y-4">
            <Badge className="btn-gradient">
              <MessageSquare className="h-3 w-3 mr-1" />
              Live Preview
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold">
              <span className="text-gradient">Widget Demo</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Experience the ConvoAI chat widget in action. Test the interface,
              explore the API, and grab the embed code for your website.
            </p>
          </motion.div>

          {/* Widget Controls */}
          <motion.div variants={itemVariants}>
            <GlassCard className="p-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${widgetLoaded ? "bg-green-500 animate-pulse" : "bg-yellow-500"}`} />
                  <span className="text-sm text-muted-foreground">
                    {widgetLoaded ? "Widget loaded and ready" : "Loading widget..."}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleWidgetAction("open")}
                    disabled={!widgetLoaded}
                  >
                    <Play className="h-4 w-4 mr-1" />
                    Open
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleWidgetAction("close")}
                    disabled={!widgetLoaded}
                  >
                    <Pause className="h-4 w-4 mr-1" />
                    Close
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleWidgetAction("toggle")}
                    disabled={!widgetLoaded}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Toggle
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if ((window as any).ConvoAI) {
                        (window as any).ConvoAI("sendMessage", "Hello! This is a test message.");
                        handleWidgetAction("open");
                      }
                    }}
                    disabled={!widgetLoaded}
                  >
                    <MessageSquare className="h-4 w-4 mr-1" />
                    Send Test Message
                  </Button>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Features Grid */}
          <motion.div variants={itemVariants}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {features.map((feature, index) => (
                <GlassCard key={index} className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <feature.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          </motion.div>

          {/* Code Examples */}
          <motion.div variants={itemVariants}>
            <GlassCard className="overflow-hidden">
              <div className="p-6 border-b border-white/5">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Code className="h-5 w-5 text-primary" />
                  Embed Code
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Copy and paste this code into your website to add the chat widget
                </p>
              </div>
              <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
                <div className="px-6 pt-4 border-b border-white/5">
                  <TabsList className="bg-background/50">
                    <TabsTrigger value="basic" className="data-[state=active]:bg-primary/20">
                      <Monitor className="h-4 w-4 mr-1" />
                      Basic
                    </TabsTrigger>
                    <TabsTrigger value="advanced" className="data-[state=active]:bg-primary/20">
                      <Zap className="h-4 w-4 mr-1" />
                      Advanced
                    </TabsTrigger>
                    <TabsTrigger value="react" className="data-[state=active]:bg-primary/20">
                      <Smartphone className="h-4 w-4 mr-1" />
                      React
                    </TabsTrigger>
                  </TabsList>
                </div>

                {Object.entries(codeExamples).map(([key, code]) => (
                  <TabsContent key={key} value={key} className="m-0">
                    <div className="relative">
                      <pre className="p-6 overflow-x-auto text-sm bg-black/20">
                        <code className="text-green-400 whitespace-pre-wrap break-all sm:whitespace-pre sm:break-normal">
                          {code}
                        </code>
                      </pre>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="absolute top-4 right-4"
                        onClick={() => copyToClipboard(code, key)}
                      >
                        {copied === key ? (
                          <>
                            <Check className="h-4 w-4 mr-1" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4 mr-1" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </GlassCard>
          </motion.div>

          {/* Device Preview Mockups */}
          <motion.div variants={itemVariants}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Desktop Preview */}
              <GlassCard className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Monitor className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Desktop Preview</h3>
                </div>
                <div className="relative bg-black/30 rounded-lg p-4 aspect-video">
                  <div className="absolute inset-4 border border-white/10 rounded bg-background/50">
                    <div className="h-8 bg-white/5 border-b border-white/10 flex items-center px-3 gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
                    </div>
                    <div className="p-4 text-xs text-muted-foreground">
                      Your website content here...
                    </div>
                  </div>
                  {/* Widget mockup */}
                  <div className="absolute bottom-8 right-8 w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/25 animate-pulse">
                    <MessageSquare className="h-6 w-6 text-white" />
                  </div>
                </div>
              </GlassCard>

              {/* Mobile Preview */}
              <GlassCard className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Smartphone className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Mobile Preview</h3>
                </div>
                <div className="flex justify-center">
                  <div className="relative bg-black/30 rounded-3xl p-2 w-48">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-6 bg-black/50 rounded-b-2xl" />
                    <div className="border border-white/10 rounded-2xl bg-background/50 aspect-[9/16] overflow-hidden">
                      <div className="h-6 bg-white/5 border-b border-white/10" />
                      <div className="p-3 text-xs text-muted-foreground">
                        Mobile site...
                      </div>
                      {/* Widget mockup */}
                      <div className="absolute bottom-6 right-4 w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/25 animate-pulse">
                        <MessageSquare className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </div>
          </motion.div>

          {/* CTA Section */}
          <motion.div variants={itemVariants}>
            <GlassCard className="p-8 text-center">
              <h2 className="text-2xl font-bold mb-2">Ready to get started?</h2>
              <p className="text-muted-foreground mb-6">
                Create your own AI chatbot and embed it on your website in minutes.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Link href="/dashboard/create">
                  <Button className="btn-gradient">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Create Your Chatbot
                  </Button>
                </Link>
                <a
                  href="https://github.com/your-repo/convoai"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Documentation
                  </Button>
                </a>
              </div>
            </GlassCard>
          </motion.div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; 2025 ConvoAI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
