/**
 * Support Bot Configuration
 * Update pricing and product details here instead of modifying code
 */

export interface PricingPlan {
  name: string;
  price: string;
  chatbots: number | string;
  messages: number;
}

export interface SupportBotConfig {
  productName: string;
  productDescription: string;
  supportEmail: string;
  features: string[];
  techStack: string[];
  pricing: PricingPlan[];
}

export const supportBotConfig: SupportBotConfig = {
  productName: "ConvoAI",
  productDescription: "An AI chatbot platform that creates custom chatbots trained on website content",
  supportEmail: "support@convoai.com",

  features: [
    "Auto-scrapes website URLs and creates vector embeddings",
    "Embeddable widget via single script tag",
    "Real-time streaming chat responses",
    "Analytics dashboard for tracking",
  ],

  techStack: [
    "React",
    "Node.js",
    "OpenAI GPT-5",
    "PostgreSQL",
  ],

  pricing: [
    {
      name: "Free Trial",
      price: "Free",
      chatbots: 1,
      messages: 100,
    },
    {
      name: "Starter",
      price: "$29/mo",
      chatbots: 3,
      messages: 1000,
    },
    {
      name: "Growth",
      price: "$79/mo",
      chatbots: 10,
      messages: 5000,
    },
    {
      name: "Business",
      price: "$199/mo",
      chatbots: "unlimited",
      messages: 20000,
    },
  ],
};

/**
 * Generate pricing text for the support bot prompt
 */
export function generatePricingText(config: SupportBotConfig): string {
  return config.pricing
    .map((plan) => {
      const duration = plan.name === "Free Trial" ? "14 days" : "";
      const chatbots = typeof plan.chatbots === "number"
        ? `${plan.chatbots} chatbot${plan.chatbots > 1 ? "s" : ""}`
        : `${plan.chatbots} chatbots`;

      return `- ${plan.name}: ${plan.price}${duration ? `, ${duration}` : ""}, ${chatbots}, ${plan.messages.toLocaleString()} messages`;
    })
    .join("\n");
}

/**
 * Build the complete support bot system prompt using KERNEL framework
 */
export function buildSupportBotPrompt(config: SupportBotConfig): string {
  const featuresText = config.features.map(f => `- ${f}`).join("\n");
  const techStackText = config.techStack.join(", ");
  const pricingText = generatePricingText(config);

  return `## CONTEXT
You are ${config.productName}'s support assistant. ${config.productName} is ${config.productDescription}.

Product details:
${featuresText}
- Tech stack: ${techStackText}

Pricing:
${pricingText}

## TASK
Answer user questions about ${config.productName} features, pricing, setup, and usage.

## CONSTRAINTS
- Keep responses under 150 words
- Do not discuss competitors
- For technical details beyond this context, direct to: ${config.supportEmail}
- For bug reports, thank user and direct to: ${config.supportEmail}
- Do not make promises about features not mentioned above
- Never fabricate pricing or feature information

## OUTPUT FORMAT
Friendly, concise answers. Use bullet points for lists. End complex questions with "Need more help? Email ${config.supportEmail}"`;
}
