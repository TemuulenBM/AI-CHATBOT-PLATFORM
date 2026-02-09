import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Send, Minus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatbotWidgetProps {
  chatbotId?: string;
  welcomeMessage?: string;
}

export function ChatbotWidget({ chatbotId, welcomeMessage = "Hi! How can I help you today?" }: ChatbotWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'bot', text: string}[]>([
    { role: 'bot', text: welcomeMessage }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => "session_" + Math.random().toString(36).substring(2, 15));
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);

  // Шинэ мессеж ирэх бүрт доод хэсэг рүү scroll хийх
  // scrollTop биш scrollIntoView ашиглана — Radix ScrollArea-ийн Viewport wrapper-тай нийцтэй
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setInput("");
    setIsLoading(true);

    // Use support bot endpoint if no chatbotId, otherwise use regular chat
    const endpoint = chatbotId ? "/api/chat/stream" : "/api/chat/support";
    const payload = chatbotId
      ? { chatbotId, sessionId, message: userMessage }
      : { sessionId, message: userMessage };

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Timeout to prevent infinite loading
    timeoutRef.current = window.setTimeout(() => {
      setIsLoading(false);
      setMessages(prev => [...prev, { role: 'bot', text: "Request timed out. Please try again." }]);
      timeoutRef.current = null;
    }, 30000); // 30 second timeout

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let botMessage = "";
      let hasStartedStreaming = false;

      // Add empty bot message (will show loading dots)
      setMessages(prev => [...prev, { role: 'bot', text: "" }]);

      if (reader) {
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");

          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.type === "chunk") {
                // First chunk received - turn off loading indicator
                if (!hasStartedStreaming) {
                  hasStartedStreaming = true;
                  setIsLoading(false);
                  if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                  }
                }
                botMessage += data.content;
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'bot', text: botMessage };
                  return updated;
                });
              } else if (data.type === "done") {
                setIsLoading(false);
                if (timeoutRef.current) {
                  clearTimeout(timeoutRef.current);
                  timeoutRef.current = null;
                }
              } else if (data.type === "error") {
                setIsLoading(false);
                if (timeoutRef.current) {
                  clearTimeout(timeoutRef.current);
                  timeoutRef.current = null;
                }
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'bot', text: data.message || "Sorry, I encountered an error. Please try again." };
                  return updated;
                });
              }
            } catch (parseError) {
              // Log parse errors for debugging
              console.warn("Failed to parse SSE message:", line, parseError);
            }
          }
        }
      }

      // If stream ended but no content was received
      // Only show error if BOTH stream never started AND message is empty
      if (!hasStartedStreaming && botMessage.length === 0) {
        console.warn("Support bot: Stream completed but no content received");
        setIsLoading(false);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'bot', text: "Sorry, I didn't receive a response. Please try again." };
          return updated;
        });
      }
    } catch (error) {
      console.error("Chat error:", error);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setIsLoading(false);
      setMessages(prev => {
        // Check if we already added an empty bot message
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.role === 'bot' && !lastMsg.text) {
          // Update the existing empty message
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'bot', text: "Sorry, I encountered an error. Please try again." };
          return updated;
        } else {
          // Add a new error message
          return [...prev, { role: 'bot', text: "Sorry, I encountered an error. Please try again." }];
        }
      });
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="mb-4 w-[350px] md:w-[400px] h-[500px] bg-card/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-4 bg-primary/10 border-b border-white/5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-xs font-bold">
                  AI
                </div>
                <div>
                  <div className="font-semibold">Support Bot</div>
                  <div className="text-xs text-green-400 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> Online
                  </div>
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsOpen(false)}>
                <Minus className="h-4 w-4" />
              </Button>
            </div>

            {/* Chat Area */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                        msg.role === 'user'
                          ? 'bg-primary text-white rounded-tr-none'
                          : 'bg-white/5 border border-white/10 rounded-tl-none'
                      }`}
                    >
                      {msg.text || "..."}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] p-3 rounded-2xl text-sm bg-white/5 border border-white/10 rounded-tl-none">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="p-4 border-t border-white/5 bg-white/5">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex gap-2"
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a message..."
                  className="bg-background/50 border-white/10 focus-visible:ring-primary"
                />
                <Button type="submit" size="icon" className="btn-gradient" disabled={isLoading || !input.trim()}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="h-14 w-14 rounded-full btn-gradient flex items-center justify-center shadow-lg shadow-primary/25"
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
      </motion.button>
    </div>
  );
}
