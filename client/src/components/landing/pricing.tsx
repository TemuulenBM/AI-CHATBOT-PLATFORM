import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export function Pricing() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Simple, Transparent Pricing</h2>
          <p className="text-muted-foreground text-lg">Choose the perfect plan for your business needs.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Starter Plan */}
          <GlassCard className="p-8 flex flex-col">
            <h3 className="text-xl font-medium mb-2">Starter</h3>
            <div className="text-4xl font-bold mb-6">$0<span className="text-base font-normal text-muted-foreground">/mo</span></div>
            <p className="text-muted-foreground mb-8">Perfect for testing and personal projects.</p>
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex gap-3"><Check className="h-5 w-5 text-primary" /> 1 Chatbot</li>
              <li className="flex gap-3"><Check className="h-5 w-5 text-primary" /> 50 Messages/mo</li>
              <li className="flex gap-3"><Check className="h-5 w-5 text-primary" /> Basic Analytics</li>
            </ul>
            <Button variant="outline" className="w-full">Get Started</Button>
          </GlassCard>

          {/* Pro Plan */}
          <GlassCard className="p-8 relative border-primary/50 flex flex-col">
            <div className="absolute top-0 right-0 bg-gradient-to-l from-primary to-secondary text-white text-xs px-3 py-1 rounded-bl-xl font-medium">POPULAR</div>
            <h3 className="text-xl font-medium mb-2">Pro</h3>
            <div className="text-4xl font-bold mb-6">$49<span className="text-base font-normal text-muted-foreground">/mo</span></div>
            <p className="text-muted-foreground mb-8">For growing businesses and startups.</p>
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex gap-3"><Check className="h-5 w-5 text-primary" /> 5 Chatbots</li>
              <li className="flex gap-3"><Check className="h-5 w-5 text-primary" /> 2,000 Messages/mo</li>
              <li className="flex gap-3"><Check className="h-5 w-5 text-primary" /> Remove Branding</li>
              <li className="flex gap-3"><Check className="h-5 w-5 text-primary" /> GPT-4 Support</li>
            </ul>
            <Button className="w-full btn-gradient">Start Free Trial</Button>
          </GlassCard>

          {/* Enterprise Plan */}
          <GlassCard className="p-8 flex flex-col">
            <h3 className="text-xl font-medium mb-2">Enterprise</h3>
            <div className="text-4xl font-bold mb-6">$199<span className="text-base font-normal text-muted-foreground">/mo</span></div>
            <p className="text-muted-foreground mb-8">For large teams and high volume.</p>
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex gap-3"><Check className="h-5 w-5 text-primary" /> Unlimited Chatbots</li>
              <li className="flex gap-3"><Check className="h-5 w-5 text-primary" /> Unlimited Messages</li>
              <li className="flex gap-3"><Check className="h-5 w-5 text-primary" /> API Access</li>
              <li className="flex gap-3"><Check className="h-5 w-5 text-primary" /> Custom Integration</li>
            </ul>
            <Button variant="outline" className="w-full">Contact Sales</Button>
          </GlassCard>
        </div>
      </div>
    </section>
  );
}
