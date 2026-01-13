import { describe, it, expect } from "vitest";
import { PLAN_LIMITS, PlanType } from "../../../server/utils/supabase";

describe("PLAN_LIMITS", () => {
  describe("Plan Tier Validation", () => {
    it("should have all expected plan types", () => {
      const expectedPlans: PlanType[] = ["free", "starter", "growth", "business"];
      const actualPlans = Object.keys(PLAN_LIMITS);

      expect(actualPlans).toEqual(expectedPlans);
    });

    it("should have correct free plan limits", () => {
      expect(PLAN_LIMITS.free).toEqual({
        chatbots: 1,
        messages: 100,
        pages_per_crawl: 50,
        price: 0,
      });
    });

    it("should have correct starter plan limits", () => {
      expect(PLAN_LIMITS.starter).toEqual({
        chatbots: 3,
        messages: 2000,
        pages_per_crawl: 200,
        price: 4900,
      });
    });

    it("should have correct growth plan limits", () => {
      expect(PLAN_LIMITS.growth).toEqual({
        chatbots: 10,
        messages: 10000,
        pages_per_crawl: 500,
        price: 9900,
      });
    });

    it("should have correct business plan limits", () => {
      expect(PLAN_LIMITS.business).toEqual({
        chatbots: 999,
        messages: 50000,
        pages_per_crawl: 2000,
        price: 29900,
      });
    });
  });

  describe("Plan Tier Ordering", () => {
    it("should have increasing chatbot limits across tiers", () => {
      expect(PLAN_LIMITS.free.chatbots).toBeLessThan(PLAN_LIMITS.starter.chatbots);
      expect(PLAN_LIMITS.starter.chatbots).toBeLessThan(PLAN_LIMITS.growth.chatbots);
      expect(PLAN_LIMITS.growth.chatbots).toBeLessThan(PLAN_LIMITS.business.chatbots);
    });

    it("should have increasing message limits across tiers", () => {
      expect(PLAN_LIMITS.free.messages).toBeLessThan(PLAN_LIMITS.starter.messages);
      expect(PLAN_LIMITS.starter.messages).toBeLessThan(PLAN_LIMITS.growth.messages);
      expect(PLAN_LIMITS.growth.messages).toBeLessThan(PLAN_LIMITS.business.messages);
    });

    it("should have increasing prices across paid tiers", () => {
      expect(PLAN_LIMITS.free.price).toBe(0);
      expect(PLAN_LIMITS.starter.price).toBeLessThan(PLAN_LIMITS.growth.price);
      expect(PLAN_LIMITS.growth.price).toBeLessThan(PLAN_LIMITS.business.price);
    });
  });

  describe("Usage Limit Enforcement Logic", () => {
    it("should correctly identify when message limit is reached", () => {
      const testCases = [
        { plan: "free" as PlanType, usage: 99, expected: false },
        { plan: "free" as PlanType, usage: 100, expected: true },
        { plan: "free" as PlanType, usage: 101, expected: true },
        { plan: "starter" as PlanType, usage: 1999, expected: false },
        { plan: "starter" as PlanType, usage: 2000, expected: true },
        { plan: "growth" as PlanType, usage: 9999, expected: false },
        { plan: "growth" as PlanType, usage: 10000, expected: true },
        { plan: "business" as PlanType, usage: 49999, expected: false },
        { plan: "business" as PlanType, usage: 50000, expected: true },
      ];

      testCases.forEach(({ plan, usage, expected }) => {
        const isLimitReached = usage >= PLAN_LIMITS[plan].messages;
        expect(isLimitReached).toBe(expected);
      });
    });

    it("should correctly identify when chatbot limit is reached", () => {
      const testCases = [
        { plan: "free" as PlanType, usage: 0, expected: false },
        { plan: "free" as PlanType, usage: 1, expected: true },
        { plan: "starter" as PlanType, usage: 2, expected: false },
        { plan: "starter" as PlanType, usage: 3, expected: true },
        { plan: "growth" as PlanType, usage: 9, expected: false },
        { plan: "growth" as PlanType, usage: 10, expected: true },
        { plan: "business" as PlanType, usage: 998, expected: false },
        { plan: "business" as PlanType, usage: 999, expected: true },
      ];

      testCases.forEach(({ plan, usage, expected }) => {
        const isLimitReached = usage >= PLAN_LIMITS[plan].chatbots;
        expect(isLimitReached).toBe(expected);
      });
    });
  });

  describe("Plan Upgrade Benefits", () => {
    it("should calculate correct upgrade multipliers for messages", () => {
      const freeToStarter = PLAN_LIMITS.starter.messages / PLAN_LIMITS.free.messages;
      const starterToGrowth = PLAN_LIMITS.growth.messages / PLAN_LIMITS.starter.messages;
      const growthToBusiness = PLAN_LIMITS.business.messages / PLAN_LIMITS.growth.messages;

      expect(freeToStarter).toBe(20); // 2000/100 = 20x
      expect(starterToGrowth).toBe(5); // 10000/2000 = 5x
      expect(growthToBusiness).toBe(5); // 50000/10000 = 5x
    });

    it("should calculate correct upgrade multipliers for chatbots", () => {
      const freeToStarter = PLAN_LIMITS.starter.chatbots / PLAN_LIMITS.free.chatbots;
      const starterToGrowth = PLAN_LIMITS.growth.chatbots / PLAN_LIMITS.starter.chatbots;

      expect(freeToStarter).toBe(3); // 3/1 = 3x
      expect(starterToGrowth).toBeCloseTo(3.33, 1); // 10/3 ≈ 3.33x
    });
  });
});
