import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { Link } from "wouter";

const plans = [
  {
    id: "free",
    name: "Free",
    price: 0,
    description: "Perfect for testing and personal projects.",
    popular: false,
    features: [
      "1 Chatbot",
      "100 Messages/month",
      "Basic Analytics",
      "Community Support",
    ],
    cta: "Get Started",
    ctaVariant: "outline" as const,
  },
  {
    id: "starter",
    name: "Starter",
    price: 49,
    description: "For small businesses getting started.",
    popular: false,
    features: [
      "3 Chatbots",
      "2,000 Messages/month",
      "Advanced Analytics",
      "Email Support",
      "Custom Branding",
    ],
    cta: "Start Free Trial",
    ctaVariant: "outline" as const,
  },
  {
    id: "growth",
    name: "Growth",
    price: 99,
    description: "For growing businesses and startups.",
    popular: true,
    features: [
      "10 Chatbots",
      "10,000 Messages/month",
      "Priority Support",
      "Remove Branding",
      "API Access",
      "GPT-5 Support",
    ],
    cta: "Start Free Trial",
    ctaVariant: "gradient" as const,
  },
  {
    id: "business",
    name: "Business",
    price: 299,
    description: "For large teams and high volume.",
    popular: false,
    features: [
      "Unlimited Chatbots",
      "50,000 Messages/month",
      "Dedicated Support",
      "White-label Option",
      "Custom Integrations",
      "SLA Guarantee",
    ],
    cta: "Contact Sales",
    ctaVariant: "outline" as const,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-24 relative overflow-hidden scroll-mt-16">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Simple, <span className="text-gradient">Transparent Pricing</span>
          </h2>
          <p className="text-muted-foreground text-lg">Start free, scale as you grow. Pay only for what you use with 85%+ profit margins.</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {plans.map((plan) => (
            <GlassCard 
              key={plan.id} 
              className={`p-6 flex flex-col ${plan.popular ? 'border-primary/50 ring-2 ring-primary/20' : ''}`}
            >
              {plan.popular && (
                <div className="absolute top-0 right-0 bg-linear-to-l from-primary to-secondary text-white text-xs px-3 py-1 rounded-bl-xl font-medium">
                  POPULAR
                </div>
              )}
              <h3 className="text-xl font-medium mb-2">{plan.name}</h3>
              <div className="text-4xl font-bold mb-4">
                ${plan.price}
                <span className="text-base font-normal text-muted-foreground">/mo</span>
              </div>
              <p className="text-muted-foreground mb-6 text-sm">{plan.description}</p>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex gap-3 text-sm">
                    <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              {plan.id === "business" ? (
                <a href="mailto:sales@convoai.com?subject=Business Plan Inquiry">
                  <Button
                    variant="outline"
                    className="w-full"
                  >
                    {plan.cta}
                  </Button>
                </a>
              ) : (
                <Link href="/signup">
                  <Button
                    variant={plan.ctaVariant === "gradient" ? "default" : "outline"}
                    className={`w-full ${plan.ctaVariant === "gradient" ? "btn-gradient" : ""}`}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              )}
            </GlassCard>
          ))}
        </div>

        <p className="text-center text-muted-foreground mt-12 text-sm">
          All plans include a 14-day free trial. No credit card required.
        </p>
      </div>
    </section>
  );
}
