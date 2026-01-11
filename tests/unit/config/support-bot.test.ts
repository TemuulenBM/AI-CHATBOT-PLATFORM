import { describe, it, expect } from "vitest";
import {
  supportBotConfig,
  generatePricingText,
  buildSupportBotPrompt,
  PricingPlan,
  SupportBotConfig,
} from "../../../server/config/support-bot.config";

describe("Support Bot Configuration", () => {
  describe("supportBotConfig", () => {
    it("should have a product name", () => {
      expect(supportBotConfig.productName).toBeDefined();
      expect(supportBotConfig.productName).toBe("ConvoAI");
      expect(typeof supportBotConfig.productName).toBe("string");
    });

    it("should have a product description", () => {
      expect(supportBotConfig.productDescription).toBeDefined();
      expect(supportBotConfig.productDescription.length).toBeGreaterThan(0);
      expect(typeof supportBotConfig.productDescription).toBe("string");
    });

    it("should have a support email", () => {
      expect(supportBotConfig.supportEmail).toBeDefined();
      expect(supportBotConfig.supportEmail).toBe("support@convoai.com");
      expect(supportBotConfig.supportEmail).toContain("@");
    });

    it("should have features array", () => {
      expect(supportBotConfig.features).toBeDefined();
      expect(Array.isArray(supportBotConfig.features)).toBe(true);
      expect(supportBotConfig.features.length).toBeGreaterThan(0);
    });

    it("should have tech stack array", () => {
      expect(supportBotConfig.techStack).toBeDefined();
      expect(Array.isArray(supportBotConfig.techStack)).toBe(true);
      expect(supportBotConfig.techStack.length).toBeGreaterThan(0);
    });

    it("should have pricing array", () => {
      expect(supportBotConfig.pricing).toBeDefined();
      expect(Array.isArray(supportBotConfig.pricing)).toBe(true);
      expect(supportBotConfig.pricing.length).toBeGreaterThan(0);
    });

    it("should have valid feature descriptions", () => {
      supportBotConfig.features.forEach((feature) => {
        expect(typeof feature).toBe("string");
        expect(feature.length).toBeGreaterThan(0);
      });
    });

    it("should have valid tech stack items", () => {
      supportBotConfig.techStack.forEach((tech) => {
        expect(typeof tech).toBe("string");
        expect(tech.length).toBeGreaterThan(0);
      });
    });

    it("should include expected features", () => {
      const features = supportBotConfig.features.join(" ");
      expect(features).toContain("website");
      expect(features).toContain("embeddings");
    });

    it("should include expected tech stack", () => {
      const techStack = supportBotConfig.techStack;
      expect(techStack).toContain("React");
      expect(techStack).toContain("Node.js");
    });
  });

  describe("Pricing Plans", () => {
    it("should have at least one pricing plan", () => {
      expect(supportBotConfig.pricing.length).toBeGreaterThanOrEqual(1);
    });

    it("should have Free Trial plan", () => {
      const freePlan = supportBotConfig.pricing.find(
        (p) => p.name === "Free Trial"
      );
      expect(freePlan).toBeDefined();
      expect(freePlan?.price).toBe("Free");
    });

    it("should have Starter plan", () => {
      const starterPlan = supportBotConfig.pricing.find(
        (p) => p.name === "Starter"
      );
      expect(starterPlan).toBeDefined();
      expect(starterPlan?.price).toBeDefined();
    });

    it("should have Growth plan", () => {
      const growthPlan = supportBotConfig.pricing.find(
        (p) => p.name === "Growth"
      );
      expect(growthPlan).toBeDefined();
      expect(growthPlan?.price).toBeDefined();
    });

    it("should have Business plan", () => {
      const businessPlan = supportBotConfig.pricing.find(
        (p) => p.name === "Business"
      );
      expect(businessPlan).toBeDefined();
      expect(businessPlan?.price).toBeDefined();
    });

    it("should have valid plan structure", () => {
      supportBotConfig.pricing.forEach((plan) => {
        expect(plan.name).toBeDefined();
        expect(plan.price).toBeDefined();
        expect(plan.chatbots).toBeDefined();
        expect(plan.messages).toBeDefined();
        expect(typeof plan.name).toBe("string");
        expect(typeof plan.price).toBe("string");
        expect(typeof plan.messages).toBe("number");
      });
    });

    it("should have increasing message limits", () => {
      const freePlan = supportBotConfig.pricing.find(
        (p) => p.name === "Free Trial"
      );
      const starterPlan = supportBotConfig.pricing.find(
        (p) => p.name === "Starter"
      );
      const growthPlan = supportBotConfig.pricing.find(
        (p) => p.name === "Growth"
      );

      if (freePlan && starterPlan && growthPlan) {
        expect(freePlan.messages).toBeLessThan(starterPlan.messages);
        expect(starterPlan.messages).toBeLessThan(growthPlan.messages);
      }
    });

    it("should allow unlimited chatbots in Business plan", () => {
      const businessPlan = supportBotConfig.pricing.find(
        (p) => p.name === "Business"
      );
      expect(businessPlan?.chatbots).toBe("unlimited");
    });

    it("should have numeric chatbot limits for lower tiers", () => {
      const freePlan = supportBotConfig.pricing.find(
        (p) => p.name === "Free Trial"
      );
      const starterPlan = supportBotConfig.pricing.find(
        (p) => p.name === "Starter"
      );

      expect(typeof freePlan?.chatbots).toBe("number");
      expect(typeof starterPlan?.chatbots).toBe("number");
    });
  });

  describe("generatePricingText", () => {
    it("should generate pricing text for all plans", () => {
      const text = generatePricingText(supportBotConfig);

      expect(text).toBeDefined();
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    });

    it("should include all plan names", () => {
      const text = generatePricingText(supportBotConfig);

      supportBotConfig.pricing.forEach((plan) => {
        expect(text).toContain(plan.name);
      });
    });

    it("should include all plan prices", () => {
      const text = generatePricingText(supportBotConfig);

      supportBotConfig.pricing.forEach((plan) => {
        expect(text).toContain(plan.price);
      });
    });

    it("should format single chatbot correctly", () => {
      const mockConfig: SupportBotConfig = {
        ...supportBotConfig,
        pricing: [
          {
            name: "Test Plan",
            price: "$10",
            chatbots: 1,
            messages: 100,
          },
        ],
      };

      const text = generatePricingText(mockConfig);
      expect(text).toContain("1 chatbot");
      expect(text).not.toContain("1 chatbots");
    });

    it("should format multiple chatbots correctly", () => {
      const mockConfig: SupportBotConfig = {
        ...supportBotConfig,
        pricing: [
          {
            name: "Test Plan",
            price: "$10",
            chatbots: 3,
            messages: 100,
          },
        ],
      };

      const text = generatePricingText(mockConfig);
      expect(text).toContain("3 chatbots");
    });

    it("should format unlimited chatbots correctly", () => {
      const mockConfig: SupportBotConfig = {
        ...supportBotConfig,
        pricing: [
          {
            name: "Test Plan",
            price: "$100",
            chatbots: "unlimited",
            messages: 10000,
          },
        ],
      };

      const text = generatePricingText(mockConfig);
      expect(text).toContain("unlimited chatbots");
    });

    it("should format message count with locale", () => {
      const mockConfig: SupportBotConfig = {
        ...supportBotConfig,
        pricing: [
          {
            name: "Test Plan",
            price: "$10",
            chatbots: 1,
            messages: 1000,
          },
        ],
      };

      const text = generatePricingText(mockConfig);
      expect(text).toContain("1,000");
    });

    it("should add duration for Free Trial", () => {
      const text = generatePricingText(supportBotConfig);
      const freePlanLine = text.split("\n").find((line) =>
        line.includes("Free Trial")
      );

      expect(freePlanLine).toContain("14 days");
    });

    it("should not add duration for paid plans", () => {
      const text = generatePricingText(supportBotConfig);
      const starterLine = text.split("\n").find((line) =>
        line.includes("Starter")
      );

      expect(starterLine).not.toContain("days");
    });

    it("should use newlines to separate plans", () => {
      const text = generatePricingText(supportBotConfig);
      const lines = text.split("\n");

      expect(lines.length).toBe(supportBotConfig.pricing.length);
    });

    it("should prefix each line with dash", () => {
      const text = generatePricingText(supportBotConfig);
      const lines = text.split("\n");

      lines.forEach((line) => {
        expect(line.trim()).toMatch(/^-/);
      });
    });
  });

  describe("buildSupportBotPrompt", () => {
    it("should build a complete prompt", () => {
      const prompt = buildSupportBotPrompt(supportBotConfig);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("should include product name", () => {
      const prompt = buildSupportBotPrompt(supportBotConfig);
      expect(prompt).toContain(supportBotConfig.productName);
    });

    it("should include product description", () => {
      const prompt = buildSupportBotPrompt(supportBotConfig);
      expect(prompt).toContain(supportBotConfig.productDescription);
    });

    it("should include all features", () => {
      const prompt = buildSupportBotPrompt(supportBotConfig);

      supportBotConfig.features.forEach((feature) => {
        expect(prompt).toContain(feature);
      });
    });

    it("should include tech stack", () => {
      const prompt = buildSupportBotPrompt(supportBotConfig);

      supportBotConfig.techStack.forEach((tech) => {
        expect(prompt).toContain(tech);
      });
    });

    it("should include pricing information", () => {
      const prompt = buildSupportBotPrompt(supportBotConfig);

      supportBotConfig.pricing.forEach((plan) => {
        expect(prompt).toContain(plan.name);
      });
    });

    it("should include support email", () => {
      const prompt = buildSupportBotPrompt(supportBotConfig);
      expect(prompt).toContain(supportBotConfig.supportEmail);
    });

    it("should include CONTEXT section", () => {
      const prompt = buildSupportBotPrompt(supportBotConfig);
      expect(prompt).toContain("## CONTEXT");
    });

    it("should include TASK section", () => {
      const prompt = buildSupportBotPrompt(supportBotConfig);
      expect(prompt).toContain("## TASK");
    });

    it("should include CONSTRAINTS section", () => {
      const prompt = buildSupportBotPrompt(supportBotConfig);
      expect(prompt).toContain("## CONSTRAINTS");
    });

    it("should include OUTPUT FORMAT section", () => {
      const prompt = buildSupportBotPrompt(supportBotConfig);
      expect(prompt).toContain("## OUTPUT FORMAT");
    });

    it("should have word limit constraint", () => {
      const prompt = buildSupportBotPrompt(supportBotConfig);
      expect(prompt).toContain("150 words");
    });

    it("should have competitor discussion constraint", () => {
      const prompt = buildSupportBotPrompt(supportBotConfig);
      expect(prompt).toContain("competitors");
    });

    it("should have fabrication constraint", () => {
      const prompt = buildSupportBotPrompt(supportBotConfig);
      expect(prompt).toContain("Never fabricate");
    });

    it("should direct bug reports to support email", () => {
      const prompt = buildSupportBotPrompt(supportBotConfig);
      expect(prompt).toContain("bug reports");
      expect(prompt).toContain(supportBotConfig.supportEmail);
    });

    it("should work with custom config", () => {
      const customConfig: SupportBotConfig = {
        productName: "TestBot",
        productDescription: "A test chatbot",
        supportEmail: "test@example.com",
        features: ["Feature 1", "Feature 2"],
        techStack: ["Tech1", "Tech2"],
        pricing: [
          {
            name: "Free",
            price: "$0",
            chatbots: 1,
            messages: 100,
          },
        ],
      };

      const prompt = buildSupportBotPrompt(customConfig);

      expect(prompt).toContain("TestBot");
      expect(prompt).toContain("test chatbot");
      expect(prompt).toContain("test@example.com");
      expect(prompt).toContain("Feature 1");
      expect(prompt).toContain("Tech1");
    });

    it("should format features with bullet points", () => {
      const prompt = buildSupportBotPrompt(supportBotConfig);
      const contextSection = prompt.split("## TASK")[0];

      supportBotConfig.features.forEach((feature) => {
        expect(contextSection).toMatch(new RegExp(`-\\s+${feature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      });
    });

    it("should format tech stack as comma-separated list", () => {
      const prompt = buildSupportBotPrompt(supportBotConfig);
      const techStackText = supportBotConfig.techStack.join(", ");
      expect(prompt).toContain(techStackText);
    });

    it("should use generatePricingText for pricing section", () => {
      const prompt = buildSupportBotPrompt(supportBotConfig);
      const pricingText = generatePricingText(supportBotConfig);

      // Check that the pricing text is included in the prompt
      const pricingLines = pricingText.split("\n");
      pricingLines.forEach((line) => {
        expect(prompt).toContain(line);
      });
    });
  });

  describe("Type Interfaces", () => {
    it("should define PricingPlan interface correctly", () => {
      const plan: PricingPlan = {
        name: "Test",
        price: "$10",
        chatbots: 5,
        messages: 1000,
      };

      expect(plan.name).toBeDefined();
      expect(plan.price).toBeDefined();
      expect(plan.chatbots).toBeDefined();
      expect(plan.messages).toBeDefined();
    });

    it("should allow string chatbots value", () => {
      const plan: PricingPlan = {
        name: "Test",
        price: "$100",
        chatbots: "unlimited",
        messages: 10000,
      };

      expect(plan.chatbots).toBe("unlimited");
    });

    it("should define SupportBotConfig interface correctly", () => {
      const config: SupportBotConfig = {
        productName: "Test",
        productDescription: "Description",
        supportEmail: "test@example.com",
        features: ["Feature"],
        techStack: ["Tech"],
        pricing: [],
      };

      expect(config.productName).toBeDefined();
      expect(config.productDescription).toBeDefined();
      expect(config.supportEmail).toBeDefined();
      expect(config.features).toBeDefined();
      expect(config.techStack).toBeDefined();
      expect(config.pricing).toBeDefined();
    });
  });

  describe("Configuration Validation", () => {
    it("should have a valid email format", () => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      expect(supportBotConfig.supportEmail).toMatch(emailRegex);
    });

    it("should have non-empty features", () => {
      expect(supportBotConfig.features.length).toBeGreaterThan(0);
      expect(supportBotConfig.features.every(f => f.length > 0)).toBe(true);
    });

    it("should have non-empty tech stack", () => {
      expect(supportBotConfig.techStack.length).toBeGreaterThan(0);
      expect(supportBotConfig.techStack.every(t => t.length > 0)).toBe(true);
    });

    it("should have non-empty pricing", () => {
      expect(supportBotConfig.pricing.length).toBeGreaterThan(0);
    });

    it("should have positive message limits", () => {
      supportBotConfig.pricing.forEach((plan) => {
        expect(plan.messages).toBeGreaterThan(0);
      });
    });

    it("should have positive or unlimited chatbot limits", () => {
      supportBotConfig.pricing.forEach((plan) => {
        if (typeof plan.chatbots === "number") {
          expect(plan.chatbots).toBeGreaterThan(0);
        } else {
          expect(plan.chatbots).toBe("unlimited");
        }
      });
    });
  });
});
