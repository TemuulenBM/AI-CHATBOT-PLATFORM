import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { Pricing } from "@/components/landing/pricing";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Bot } from "lucide-react";
import { ChatbotWidget } from "@/components/chatbot-widget/widget";

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/50 backdrop-blur-lg border-b border-white/5">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white">
              <Bot className="h-5 w-5" />
            </div>
            <span>ChatAI</span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#testimonials" className="hover:text-foreground transition-colors">Testimonials</a>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" className="hidden sm:flex">Log In</Button>
            </Link>
            <Link href="/signup">
              <Button className="btn-gradient">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <Hero />
        <Features />
        <Pricing />
      </main>

      <footer className="py-12 border-t border-white/5 bg-background/50">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>© 2024 ChatAI Platform. All rights reserved.</p>
        </div>
      </footer>

      <ChatbotWidget />
    </div>
  );
}
