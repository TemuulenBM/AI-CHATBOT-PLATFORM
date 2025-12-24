import { GlassCard } from "@/components/ui/glass-card";
import { Bot, Zap, Shield, Globe, Cpu, BarChart3, Workflow, Link2, DollarSign, Timer, TrendingUp, MessageSquare } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Instant Deploy",
    description: "Enter your website URL and your chatbot goes live immediately! It learns your content in the background while serving customers right away."
  },
  {
    icon: Bot,
    title: "Custom AI Persona",
    description: "Customize your chatbot's personality, tone, and knowledge base to match your brand identity perfectly."
  },
  {
    icon: Cpu,
    title: "GPT-5 & Claude Powered",
    description: "Leverage the latest flagship reasoning models from OpenAI (GPT-5) and Anthropic (Claude) for unmatched intelligence."
  },
  {
    icon: Globe,
    title: "95+ Languages",
    description: "Support customers worldwide with automatic language detection and translation in 95+ languages."
  },
  {
    icon: BarChart3,
    title: "Real-time Analytics",
    description: "Track conversations, sentiment, resolution rates, and customer satisfaction in real-time dashboards."
  },
  {
    icon: DollarSign,
    title: "Reduce Support Costs",
    description: "Cut support tickets by up to 70% and see immediate ROI. Pay only for what you use with usage-based API pricing."
  },
  {
    icon: Link2,
    title: "Easy Website Embed",
    description: "Add chatbot to your website with a single line of code. Includes 'Powered by' branding for viral growth."
  },
  {
    icon: Workflow,
    title: "n8n Integrations",
    description: "Connect to your CRM, Zendesk, Slack, Google Sheets, and 350+ apps with no-code automation workflows."
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "Bank-grade encryption, GDPR compliance, and SOC 2 Type II certification to keep your data safe."
  },
  {
    icon: Timer,
    title: "24/7 Auto-Support",
    description: "Never miss a customer query. Your AI chatbot works around the clock, handling unlimited conversations."
  },
  {
    icon: MessageSquare,
    title: "Lead Capture & CRM",
    description: "Automatically capture leads, qualify prospects, and sync to your CRM with intelligent conversation routing."
  },
  {
    icon: TrendingUp,
    title: "Smart Escalation",
    description: "Complex queries? Auto-escalate to human agents via Slack, email, or ticketing systems when needed."
  }
];

export function Features() {
  return (
    <section id="features" className="py-24 relative scroll-mt-16">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Everything You Need to <br />
            <span className="text-gradient">Automate Customer Support</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Launch your AI chatbot in minutes, reduce support costs by 70%, and deliver 24/7 customer service without writing a single line of code.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <GlassCard key={i} className="p-8 group">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}
