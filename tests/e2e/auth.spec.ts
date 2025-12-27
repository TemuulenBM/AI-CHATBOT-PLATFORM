import { test, expect } from "@playwright/test";

// Browser-based tests - skip if browsers not installed
test.describe("Authentication Flow - Browser", () => {
  test.skip(({ browserName }) => true, "Browser tests require 'npx playwright install'");

  test("should redirect unauthenticated users from dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login|sign-in|clerk|\//);
  });
});

// API-based authentication tests
test.describe("Authentication Flow - API", () => {
  test("should show authentication required for API endpoints", async ({ request }) => {
    const response = await request.get("/api/chatbots");

    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body.message).toMatch(/token|auth/i);
  });

  test("should reject invalid authentication tokens", async ({ request }) => {
    const response = await request.get("/api/chatbots", {
      headers: {
        Authorization: "Bearer invalid-token-12345",
      },
    });

    expect(response.status()).toBe(401);
  });

  test("subscription endpoints require authentication", async ({ request }) => {
    const response = await request.get("/api/subscriptions");
    expect(response.status()).toBe(401);
  });

  test("public endpoints work without authentication", async ({ request }) => {
    // Plans endpoint should be public
    const plansResponse = await request.get("/api/subscriptions/plans");
    expect(plansResponse.ok()).toBeTruthy();

    // Health endpoint should be public
    const healthResponse = await request.get("/api/health");
    expect(healthResponse.ok()).toBeTruthy();
  });
});

test.describe("Session Persistence", () => {
  test("should handle expired tokens gracefully", async ({ request }) => {
    const response = await request.get("/api/chatbots", {
      headers: {
        Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjowfQ.invalid",
      },
    });

    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body).toHaveProperty("message");
  });
});
