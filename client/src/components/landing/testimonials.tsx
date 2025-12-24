import { GlassCard } from "@/components/ui/glass-card";
import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Sarah Chen",
    role: "CEO at TechStart",
    company: "SaaS Startup",
    image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah",
    rating: 5,
    text: "We deployed our chatbot in under 10 minutes and saw a 60% reduction in support tickets within the first week. The ROI was immediate."
  },
  {
    name: "Michael Rodriguez",
    role: "Customer Success Manager",
    company: "E-commerce Platform",
    image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Michael",
    rating: 5,
    text: "The n8n integrations are a game-changer. Our chatbot automatically creates Zendesk tickets and updates our CRM. Saves us 20 hours a week."
  },
  {
    name: "Emily Watson",
    role: "Marketing Director",
    company: "Digital Agency",
    image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Emily",
    rating: 5,
    text: "We're capturing 3x more leads than before. The AI qualifies prospects automatically and our sales team gets notified via Slack instantly."
  },
  {
    name: "David Kim",
    role: "Founder",
    company: "AI Consulting Firm",
    image: "https://api.dicebear.com/7.x/avataaars/svg?seed=David",
    rating: 5,
    text: "Best investment we made this year. $99/month to handle thousands of customer questions. Our support costs dropped by 70%."
  },
  {
    name: "Lisa Anderson",
    role: "Operations Manager",
    company: "SaaS Company",
    image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Lisa",
    rating: 5,
    text: "The 24/7 support capability is incredible. We're serving customers in 30+ countries without hiring a single additional support agent."
  },
  {
    name: "James Park",
    role: "Head of Product",
    company: "Fintech Startup",
    image: "https://api.dicebear.com/7.x/avataaars/svg?seed=James",
    rating: 5,
    text: "Setup was literally copy-paste our URL and we had a chatbot. The analytics dashboard shows us exactly what customers are asking about."
  }
];

export function Testimonials() {
  return (
    <section id="testimonials" className="py-24 relative scroll-mt-16">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Loved by <span className="text-gradient">Thousands of Businesses</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Join companies that have reduced support costs by 70% and improved customer satisfaction with AI-powered chatbots.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((testimonial, i) => (
            <GlassCard key={i} className="p-6">
              <div className="flex items-start gap-4 mb-4">
                <img
                  src={testimonial.image}
                  alt={testimonial.name}
                  className="w-12 h-12 rounded-full"
                />
                <div className="flex-1">
                  <h4 className="font-semibold">{testimonial.name}</h4>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                  <p className="text-xs text-muted-foreground">{testimonial.company}</p>
                </div>
                <div className="flex gap-0.5">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">
                "{testimonial.text}"
              </p>
            </GlassCard>
          ))}
        </div>

        <div className="mt-16 text-center">
          <div className="flex items-center justify-center gap-8 flex-wrap">
            <div className="text-center">
              <div className="text-3xl font-bold text-gradient">10K+</div>
              <div className="text-sm text-muted-foreground">Active Chatbots</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-gradient">5M+</div>
              <div className="text-sm text-muted-foreground">Messages Handled</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-gradient">70%</div>
              <div className="text-sm text-muted-foreground">Avg. Cost Reduction</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-gradient">4.9/5</div>
              <div className="text-sm text-muted-foreground">Customer Rating</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
