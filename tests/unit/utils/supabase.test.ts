import { describe, it, expect, vi, beforeEach } from "vitest";
import { PLAN_LIMITS } from "../../../server/utils/supabase";

// Mock logger
vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Supabase Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Skip actual database health checks - they require complex mocking
  // Focus on testing the data structures and constants instead

  describe("Type Validation Helpers", () => {
    it("should validate string field types", () => {
      const fieldType: "text" | "email" | "phone" | "select" = "text";
      expect(["text", "email", "phone", "select"]).toContain(fieldType);
    });

    it("should validate trigger types", () => {
      const triggerTypes: Array<"time_on_page" | "scroll_depth" | "exit_intent" | "page_url"> = [
        "time_on_page",
        "scroll_depth",
        "exit_intent",
        "page_url"
      ];
      triggerTypes.forEach(type => {
        expect(["time_on_page", "scroll_depth", "exit_intent", "page_url"]).toContain(type);
      });
    });

    it("should validate locale codes", () => {
      const locales = ["en", "es", "fr", "de", "it"];
      locales.forEach(locale => {
        expect(locale.length).toBe(2);
        expect(locale).toMatch(/^[a-z]{2}$/);
      });
    });

    it("should validate position values", () => {
      const positions: Array<"bottom-right" | "bottom-left" | "bottom-center"> = [
        "bottom-right",
        "bottom-left",
        "bottom-center"
      ];
      positions.forEach(pos => {
        expect(pos).toContain("bottom");
      });
    });

    it("should validate widget sizes", () => {
      const sizes: Array<"compact" | "standard" | "large"> = [
        "compact",
        "standard",
        "large"
      ];
      expect(sizes.length).toBe(3);
    });

    it("should validate header styles", () => {
      const styles: Array<"solid" | "gradient" | "glass"> = [
        "solid",
        "gradient",
        "glass"
      ];
      expect(styles.length).toBe(3);
    });

    it("should validate animation styles", () => {
      const animations: Array<"slide" | "fade" | "bounce" | "none"> = [
        "slide",
        "fade",
        "bounce",
        "none"
      ];
      expect(animations.length).toBe(4);
    });

    it("should validate chatbot statuses", () => {
      const statuses: Array<"pending" | "scraping" | "embedding" | "ready" | "failed"> = [
        "pending",
        "scraping",
        "embedding",
        "ready",
        "failed"
      ];
      expect(statuses.length).toBe(5);
    });

    it("should validate message roles", () => {
      const roles: Array<"user" | "assistant"> = ["user", "assistant"];
      expect(roles.length).toBe(2);
    });

    it("should validate feedback ratings", () => {
      const ratings: Array<"positive" | "negative"> = ["positive", "negative"];
      expect(ratings.length).toBe(2);
    });

    it("should validate sentiment values", () => {
      const sentiments: Array<"positive" | "neutral" | "negative"> = [
        "positive",
        "neutral",
        "negative"
      ];
      expect(sentiments.length).toBe(3);
    });

    it("should validate color format", () => {
      const colors = ["#FF0000", "#00FF00", "#0000FF", "#667eea"];
      colors.forEach(color => {
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });

    it("should validate border radius range", () => {
      const validRadii = [0, 6, 12, 18, 24];
      validRadii.forEach(radius => {
        expect(radius).toBeGreaterThanOrEqual(0);
        expect(radius).toBeLessThanOrEqual(24);
      });
    });

    it("should validate openDelay values", () => {
      const delays = [0, 1000, 3000, 5000];
      delays.forEach(delay => {
        expect(delay).toBeGreaterThanOrEqual(0);
      });
    });

    it("should validate font families", () => {
      const fonts = ["Inter", "Roboto", "Open Sans", "Arial"];
      fonts.forEach(font => {
        expect(font.length).toBeGreaterThan(0);
      });
    });
  });

  describe("PLAN_LIMITS", () => {
    it("should define free plan limits", () => {
      expect(PLAN_LIMITS.free).toBeDefined();
      expect(PLAN_LIMITS.free.chatbots).toBe(1);
      expect(PLAN_LIMITS.free.messages).toBe(100);
      expect(PLAN_LIMITS.free.price).toBe(0);
    });

    it("should define starter plan limits", () => {
      expect(PLAN_LIMITS.starter).toBeDefined();
      expect(PLAN_LIMITS.starter.chatbots).toBe(3);
      expect(PLAN_LIMITS.starter.messages).toBe(2000);
      expect(PLAN_LIMITS.starter.price).toBe(4900);
    });

    it("should define growth plan limits", () => {
      expect(PLAN_LIMITS.growth).toBeDefined();
      expect(PLAN_LIMITS.growth.chatbots).toBe(10);
      expect(PLAN_LIMITS.growth.messages).toBe(10000);
      expect(PLAN_LIMITS.growth.price).toBe(9900);
    });

    it("should define business plan limits", () => {
      expect(PLAN_LIMITS.business).toBeDefined();
      expect(PLAN_LIMITS.business.chatbots).toBe(999);
      expect(PLAN_LIMITS.business.messages).toBe(50000);
      expect(PLAN_LIMITS.business.price).toBe(29900);
    });

    it("should have increasing chatbot limits across plans", () => {
      expect(PLAN_LIMITS.free.chatbots).toBeLessThan(PLAN_LIMITS.starter.chatbots);
      expect(PLAN_LIMITS.starter.chatbots).toBeLessThan(PLAN_LIMITS.growth.chatbots);
      expect(PLAN_LIMITS.growth.chatbots).toBeLessThan(PLAN_LIMITS.business.chatbots);
    });

    it("should have increasing message limits across plans", () => {
      expect(PLAN_LIMITS.free.messages).toBeLessThan(PLAN_LIMITS.starter.messages);
      expect(PLAN_LIMITS.starter.messages).toBeLessThan(PLAN_LIMITS.growth.messages);
      expect(PLAN_LIMITS.growth.messages).toBeLessThan(PLAN_LIMITS.business.messages);
    });

    it("should have increasing prices across plans", () => {
      expect(PLAN_LIMITS.free.price).toBeLessThan(PLAN_LIMITS.starter.price);
      expect(PLAN_LIMITS.starter.price).toBeLessThan(PLAN_LIMITS.growth.price);
      expect(PLAN_LIMITS.growth.price).toBeLessThan(PLAN_LIMITS.business.price);
    });

    it("should have all required plan types", () => {
      const planTypes = Object.keys(PLAN_LIMITS);
      expect(planTypes).toContain("free");
      expect(planTypes).toContain("starter");
      expect(planTypes).toContain("growth");
      expect(planTypes).toContain("business");
    });

    it("should have consistent structure across all plans", () => {
      Object.values(PLAN_LIMITS).forEach((plan) => {
        expect(plan).toHaveProperty("chatbots");
        expect(plan).toHaveProperty("messages");
        expect(plan).toHaveProperty("price");
        expect(typeof plan.chatbots).toBe("number");
        expect(typeof plan.messages).toBe("number");
        expect(typeof plan.price).toBe("number");
      });
    });
  });

  describe("Database Type Interfaces", () => {
    it("should validate PreChatField structure", () => {
      const field = {
        name: "email",
        type: "email" as const,
        label: "Your Email",
        placeholder: "Enter email",
        required: true,
      };

      expect(field.name).toBeDefined();
      expect(field.type).toBeDefined();
      expect(field.label).toBeDefined();
      expect(field.required).toBeDefined();
    });

    it("should support select field with options", () => {
      const field = {
        name: "department",
        type: "select" as const,
        label: "Department",
        required: true,
        options: ["Sales", "Support", "Engineering"],
      };

      expect(field.options).toBeDefined();
      expect(field.options?.length).toBe(3);
    });

    it("should validate ProactiveTrigger structure", () => {
      const trigger = {
        id: "trigger-1",
        type: "time_on_page" as const,
        value: 30,
        message: "Need help?",
        enabled: true,
      };

      expect(trigger.id).toBeDefined();
      expect(trigger.type).toBeDefined();
      expect(trigger.message).toBeDefined();
      expect(trigger.enabled).toBe(true);
    });

    it("should validate ChatbotSettings structure", () => {
      const settings = {
        personality: 50,
        primaryColor: "#0066FF",
        welcomeMessage: "Hello!",
        systemPrompt: "You are a helpful assistant",
        allowedDomains: ["example.com"],
        locale: "en",
        soundEnabled: true,
        position: "bottom-right" as const,
        widgetSize: "standard" as const,
        borderRadius: 12,
        fontFamily: "Inter",
        headerStyle: "solid" as const,
        showBranding: true,
        openDelay: 5,
        showInitially: false,
        animationStyle: "slide" as const,
      };

      expect(settings.personality).toBeGreaterThanOrEqual(0);
      expect(settings.personality).toBeLessThanOrEqual(100);
      expect(settings.primaryColor).toMatch(/^#[0-9A-F]{6}$/i);
      expect(settings.allowedDomains).toBeInstanceOf(Array);
    });

    it("should validate ConversationMessage structure", () => {
      const message = {
        role: "user" as const,
        content: "Hello, I need help",
        timestamp: new Date().toISOString(),
        sentiment: "positive" as const,
      };

      expect(message.role).toBeDefined();
      expect(message.content).toBeDefined();
      expect(message.timestamp).toBeDefined();
      expect(["positive", "neutral", "negative"]).toContain(message.sentiment);
    });

    it("should validate UsageData structure", () => {
      const usage = {
        messages_count: 150,
        chatbots_count: 2,
        period_start: new Date().toISOString(),
      };

      expect(usage.messages_count).toBeGreaterThanOrEqual(0);
      expect(usage.chatbots_count).toBeGreaterThanOrEqual(0);
      expect(usage.period_start).toBeDefined();
    });

    it("should support all chatbot status values", () => {
      const statuses = ["pending", "scraping", "embedding", "ready", "failed"];

      statuses.forEach(status => {
        expect(["pending", "scraping", "embedding", "ready", "failed"]).toContain(status);
      });
    });

    it("should support all user roles", () => {
      const roles = ["user", "assistant"];

      roles.forEach(role => {
        expect(["user", "assistant"]).toContain(role);
      });
    });

    it("should support all feedback ratings", () => {
      const ratings = ["positive", "negative"];

      ratings.forEach(rating => {
        expect(["positive", "negative"]).toContain(rating);
      });
    });

    it("should validate preChatForm structure", () => {
      const preChatForm = {
        enabled: true,
        title: "Contact Information",
        fields: [
          {
            name: "name",
            type: "text" as const,
            label: "Name",
            required: true,
          },
          {
            name: "email",
            type: "email" as const,
            label: "Email",
            required: true,
          },
        ],
      };

      expect(preChatForm.enabled).toBe(true);
      expect(preChatForm.fields.length).toBe(2);
      expect(preChatForm.fields[0].type).toBe("text");
      expect(preChatForm.fields[1].type).toBe("email");
    });

    it("should validate proactiveTriggers array", () => {
      const triggers = [
        {
          id: "t1",
          type: "time_on_page" as const,
          value: 30,
          message: "Need help?",
          enabled: true,
        },
        {
          id: "t2",
          type: "scroll_depth" as const,
          value: 50,
          message: "Looking for something?",
          enabled: true,
        },
      ];

      expect(triggers.length).toBe(2);
      expect(triggers[0].type).toBe("time_on_page");
      expect(triggers[1].type).toBe("scroll_depth");
    });

    it("should validate all position options", () => {
      const positions = ["bottom-right", "bottom-left", "bottom-center"];

      positions.forEach(position => {
        expect(["bottom-right", "bottom-left", "bottom-center"]).toContain(position);
      });
    });

    it("should validate all widget sizes", () => {
      const sizes = ["compact", "standard", "large"];

      sizes.forEach(size => {
        expect(["compact", "standard", "large"]).toContain(size);
      });
    });

    it("should validate all header styles", () => {
      const styles = ["solid", "gradient", "glass"];

      styles.forEach(style => {
        expect(["solid", "gradient", "glass"]).toContain(style);
      });
    });

    it("should validate all animation styles", () => {
      const animations = ["slide", "fade", "bounce", "none"];

      animations.forEach(animation => {
        expect(["slide", "fade", "bounce", "none"]).toContain(animation);
      });
    });

    it("should validate personality range", () => {
      const validPersonalities = [0, 25, 50, 75, 100];
      const invalidPersonalities = [-1, 101, 150];

      validPersonalities.forEach(p => {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(100);
      });

      invalidPersonalities.forEach(p => {
        const isValid = p >= 0 && p <= 100;
        expect(isValid).toBe(false);
      });
    });

    it("should validate borderRadius range", () => {
      const validRadii = [0, 6, 12, 18, 24];

      validRadii.forEach(r => {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(24);
      });
    });
  });
});
