import { useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Check, Globe, Loader2, Sparkles, Code2 } from "lucide-react";
import { useChatbotStore } from "@/store/chatbot-store";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

const steps = [
  { number: 1, title: "Source", icon: Globe },
  { number: 2, title: "Customize", icon: Sparkles },
  { number: 3, title: "Install", icon: Code2 },
];

export default function CreateChatbot() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState("");
  const { addChatbot } = useChatbotStore();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleScan = () => {
    if (!url) {
      toast({
        title: "Error",
        description: "Please enter a valid URL",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    // Simulate scanning
    setTimeout(() => {
      setLoading(false);
      setStep(2);
      toast({
        title: "Website Scanned",
        description: "We've successfully analyzed your content.",
      });
    }, 2000);
  };

  const handleFinish = () => {
    addChatbot({
      id: Math.random().toString(),
      name: "My New Chatbot",
      url: url,
      status: "active",
      messages_count: 0,
      last_active: "Just now"
    });
    setStep(3);
    toast({
      title: "Success!",
      description: "Your chatbot has been created and is ready to install.",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="pl-64 p-8">
        <div className="max-w-4xl mx-auto">
          <header className="mb-12">
            <h1 className="text-3xl font-bold mb-2">Create New Chatbot</h1>
            <p className="text-muted-foreground">Train a new AI assistant on your data</p>
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
                  <Button className="h-12 px-8 btn-gradient" onClick={handleScan} disabled={loading}>
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Scan Website"}
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <Label className="mb-2 block">Chatbot Name</Label>
                    <Input defaultValue="My Support Bot" className="bg-background/50" />
                  </div>
                  <div>
                    <Label className="mb-2 block">Primary Color</Label>
                    <div className="flex gap-3">
                      {['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500'].map((c) => (
                        <div key={c} className={`h-8 w-8 rounded-full cursor-pointer ring-2 ring-offset-2 ring-offset-background ${c} ring-transparent hover:ring-white/50`} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="mb-2 block">Personality</Label>
                    <div className="p-4 rounded-lg border border-white/5 bg-background/50">
                      <div className="flex justify-between text-xs text-muted-foreground mb-2">
                        <span>Professional</span>
                        <span>Friendly</span>
                        <span>Casual</span>
                      </div>
                      <input type="range" className="w-full accent-primary" />
                    </div>
                  </div>
                  <Button className="w-full btn-gradient mt-4" onClick={handleFinish}>Create Chatbot</Button>
                </div>
                <div className="border border-white/5 rounded-xl bg-background/50 p-6 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-4">Preview</p>
                    <div className="w-[300px] h-[400px] bg-card rounded-xl border border-white/10 shadow-2xl relative overflow-hidden flex flex-col">
                      <div className="bg-primary p-4 text-white text-sm font-medium">Support Bot</div>
                      <div className="flex-1 p-4 bg-background/95">
                        <div className="bg-white/5 rounded-lg rounded-tl-none p-3 text-xs max-w-[80%] mb-2">
                          Hello! How can I assist you today?
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

            {step === 3 && (
              <div className="max-w-2xl mx-auto text-center py-8">
                <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6 text-green-500">
                  <Check className="h-8 w-8" />
                </div>
                <h2 className="text-2xl font-bold mb-4">Chatbot Created Successfully!</h2>
                <p className="text-muted-foreground mb-8">Copy the code below and paste it into your website's HTML before the closing body tag.</p>

                <div className="relative bg-black/50 rounded-lg p-6 text-left font-mono text-sm border border-white/10 mb-8 group">
                  <code className="text-blue-400">
                    {`<script src="https://chatai.com/widget.js" data-id="12345"></script>`}
                  </code>
                  <Button size="sm" variant="secondary" className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    Copy
                  </Button>
                </div>

                <div className="flex justify-center gap-4">
                  <Button variant="outline" onClick={() => setLocation("/dashboard/chatbots")}>Go to Dashboard</Button>
                  <Button className="btn-gradient">Test Live Widget</Button>
                </div>
              </div>
            )}
          </GlassCard>
        </div>
      </main>
    </div>
  );
}
