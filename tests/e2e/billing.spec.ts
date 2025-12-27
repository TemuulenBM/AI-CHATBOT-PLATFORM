import { test, expect } from "@playwright/test";

test.describe("Billing API", () => {
  test("should return all pricing plans", async ({ request }) => {
    const response = await request.get("/api/subscriptions/plans");
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.plans).toBeInstanceOf(Array);
    expect(body.plans.length).toBeGreaterThanOrEqual(3);

    // Validate plan structure
    const requiredFields = ["id", "name", "price", "features"];
    body.plans.forEach((plan: Record<string, unknown>) => {
      requiredFields.forEach((field) => {
        expect(plan).toHaveProperty(field);
      });
    });

    // Check for expected plans
    const planIds = body.plans.map((p: { id: string }) => p.id);
    expect(planIds).toContain("free");
    expect(planIds).toContain("starter");
    expect(planIds).toContain("growth");
  });

  test("free plan should have zero price", async ({ request }) => {
    const response = await request.get("/api/subscriptions/plans");
    const body = await response.json();

    const freePlan = body.plans.find((p: { id: string }) => p.id === "free");
    expect(freePlan).toBeDefined();
    expect(freePlan.price).toBe(0);
  });

  test("paid plans should have increasing prices", async ({ request }) => {
    const response = await request.get("/api/subscriptions/plans");
    const body = await response.json();

    const starter = body.plans.find((p: { id: string }) => p.id === "starter");
    const growth = body.plans.find((p: { id: string }) => p.id === "growth");
    const business = body.plans.find((p: { id: string }) => p.id === "business");

    expect(starter.price).toBeLessThan(growth.price);
    expect(growth.price).toBeLessThan(business.price);
  });

  test("plans should have feature lists", async ({ request }) => {
    const response = await request.get("/api/subscriptions/plans");
    const body = await response.json();

    body.plans.forEach((plan: { id: string; features: string[] }) => {
      expect(plan.features).toBeInstanceOf(Array);
      expect(plan.features.length).toBeGreaterThan(0);
    });
  });

  test("checkout requires authentication", async ({ request }) => {
    const response = await request.post("/api/subscriptions/checkout", {
      data: {
        plan: "starter",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      },
    });

    expect(response.status()).toBe(401);
  });

  test("portal requires authentication", async ({ request }) => {
    const response = await request.post("/api/subscriptions/portal", {
      data: {
        returnUrl: "https://example.com/settings",
      },
    });

    expect(response.status()).toBe(401);
  });
});

test.describe("Webhook Endpoint", () => {
  test("webhook endpoint exists and requires signature", async ({ request }) => {
    const response = await request.post("/api/subscriptions/webhook", {
      data: {
        event_type: "subscription.created",
        data: {},
      },
    });

    // Should reject without proper signature (400 or similar)
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test("webhook rejects invalid JSON", async ({ request }) => {
    const response = await request.post("/api/subscriptions/webhook", {
      headers: {
        "Content-Type": "application/json",
        "Paddle-Signature": "ts=1234;h1=invalid",
      },
      data: "invalid json",
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});
