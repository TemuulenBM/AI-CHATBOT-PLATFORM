import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Globe,
  Code2,
  Copy,
  Check,
  Loader2,
  Bot,
} from "lucide-react";
import { useChatbotStore, Chatbot } from "@/store/chatbot-store";
import { useToast } from "@/hooks/use-toast";

interface OnboardingStepsProps {
  onComplete: () => void;
  onSkip: () => void;
}

const stepVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 100 : -100,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 100 : -100,
    opacity: 0,
  }),
};

export function OnboardingSteps({ onComplete, onSkip }: OnboardingStepsProps) {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(0);
  const [chatbotName, setChatbotName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [createdChatbot, setCreatedChatbot] = useState<Chatbot | null>(null);
  const [copied, setCopied] = useState(false);

  const { createChatbot, isLoading } = useChatbotStore();
  const { toast } = useToast();

  const goNext = () => {
    setDirection(1);
    setStep((s) => s + 1);
  };

  const goBack = () => {
    setDirection(-1);
    setStep((s) => s - 1);
  };

  const validateUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleCreateChatbot = async () => {
    if (!chatbotName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a name for your chatbot",
        variant: "destructive",
      });
      return;
    }

    if (!websiteUrl.trim() || !validateUrl(websiteUrl)) {
      toast({
        title: "Valid URL required",
        description: "Please enter a valid website URL",
        variant: "destructive",
      });
      return;
    }

    const chatbot = await createChatbot(chatbotName.trim(), websiteUrl.trim());
    if (chatbot) {
      setCreatedChatbot(chatbot);
      goNext();
    } else {
      toast({
        title: "Error",
        description: "Failed to create chatbot. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getEmbedCode = () => {
    if (!createdChatbot) return "";
    return `<script async src="${window.location.origin}/widget.js" data-chatbot-id="${createdChatbot.id}"></script>`;
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(getEmbedCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Copied!",
      description: "Embed code copied to clipboard",
    });
  };

  return (
    <div className="relative overflow-hidden">
      {/* Progress indicator */}
      <div className="flex justify-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-2 w-16 rounded-full transition-colors ${
              s <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait" custom={direction}>
        {step === 1 && (
          <motion.div
            key="step1"
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3 }}
            className="text-center py-8"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6"
            >
              <Sparkles className="h-10 w-10 text-primary" />
            </motion.div>
            <h2 className="text-2xl font-bold mb-3">Welcome to ConvoAI!</h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Let's get you started with your first AI chatbot in 3 easy steps.
              It only takes a couple of minutes!
            </p>
            <div className="flex justify-center gap-4">
              <Button variant="outline" onClick={onSkip}>
                Skip Tour
              </Button>
              <Button className="btn-gradient gap-2" onClick={goNext}>
                Let's Begin <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3 }}
            className="py-4"
          >
            <div className="text-center mb-8">
              <div className="h-16 w-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
                <Globe className="h-8 w-8 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold mb-2">Create Your First Chatbot</h2>
              <p className="text-muted-foreground text-sm">
                We'll train your chatbot on your website content
              </p>
            </div>

            <div className="space-y-4 max-w-md mx-auto">
              <div className="space-y-2">
                <Label htmlFor="chatbot-name">Chatbot Name</Label>
                <Input
                  id="chatbot-name"
                  placeholder="My Support Bot"
                  value={chatbotName}
                  onChange={(e) => setChatbotName(e.target.value)}
                  className="bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website-url">Website URL</Label>
                <Input
                  id="website-url"
                  placeholder="https://example.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  className="bg-background/50"
                />
                <p className="text-xs text-muted-foreground">
                  We'll crawl your website to train the chatbot
                </p>
              </div>
            </div>

            <div className="flex justify-center gap-4 mt-8">
              <Button variant="outline" onClick={goBack} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                className="btn-gradient gap-2"
                onClick={handleCreateChatbot}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Create & Next <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3 }}
            className="py-4"
          >
            <div className="text-center mb-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4"
              >
                <Check className="h-8 w-8 text-green-500" />
              </motion.div>
              <h2 className="text-xl font-bold mb-2">Add Widget to Your Website</h2>
              <p className="text-muted-foreground text-sm">
                Copy this code and paste it before {"</body>"} on your website
              </p>
            </div>

            <div className="max-w-lg mx-auto">
              <div className="relative bg-black/50 rounded-lg p-4 border border-white/10 group">
                <code className="text-sm text-blue-400 break-all block">
                  {getEmbedCode()}
                </code>
                <Button
                  size="sm"
                  variant={copied ? "default" : "secondary"}
                  className="absolute top-2 right-2"
                  onClick={handleCopyCode}
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-1" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1" /> Copy Code
                    </>
                  )}
                </Button>
              </div>

              <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mt-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <Bot className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground mb-1">Your chatbot is live!</p>
                    <p>
                      It's learning about your website in the background. This usually takes
                      5-10 minutes.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-4 mt-8">
              <Button variant="outline" onClick={goBack} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button className="btn-gradient" onClick={onComplete}>
                Done, Go to Dashboard
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
