import { GlassCard } from "@/components/ui/glass-card";
import { Bot, Zap, Shield, Globe, Cpu, BarChart3 } from "lucide-react";

const features = [
  {
    icon: Bot,
    title: "Custom AI Persona",
    description: "Customize your chatbot's personality, tone, and knowledge base to match your brand."
  },
  {
    icon: Zap,
    title: "Instant Training",
    description: "Simply input your website URL and our AI will scrape and learn your content in seconds."
  },
  {
    icon: Globe,
    title: "Multi-language",
    description: "Support customers in 95+ languages with automatic translation and detection."
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "Bank-grade encryption and GDPR compliance to keep your data safe."
  },
  {
    icon: Cpu,
    title: "GPT-4 Powered",
    description: "Leverage the latest AI models for human-like understanding and responses."
  },
  {
    icon: BarChart3,
    title: "Advanced Analytics",
    description: "Track conversations, sentiment, and resolution rates in real-time."
  }
];

export function Features() {
  return (
    <section className="py-24 relative">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Powerful Features for <br />
            <span className="text-gradient">Modern Businesses</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Everything you need to automate customer support and increase engagement without writing a single line of code.
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
