import { test, expect } from "@playwright/test";

test.describe("Health Check Endpoints", () => {
  test("basic health check returns 200", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe("ok");
  });

  test("detailed health check returns service statuses", async ({ request }) => {
    const response = await request.get("/api/health/detailed");
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("services");
    expect(body.services).toHaveProperty("database");
    expect(body.services).toHaveProperty("redis");
  });
});
