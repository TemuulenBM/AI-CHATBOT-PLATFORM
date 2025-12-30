import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { Express } from "express";
import cookieParser from "cookie-parser";
import { setCsrfToken, validateCsrfToken, getCsrfToken } from "../../server/middleware/csrf";

/**
 * Integration tests for CSRF protection
 * These tests verify the complete flow of CSRF protection in a real Express app
 */

describe("CSRF Protection Integration Tests", () => {
  let app: Express;

  beforeAll(() => {
    // Create a test Express app with CSRF protection
    app = express();

    // Setup middleware (same order as production)
    app.use(cookieParser());
    app.use(express.json());
    app.use(setCsrfToken);

    // CSRF token endpoint (BEFORE validation middleware)
    app.get("/api/csrf-token", getCsrfToken);

    // Webhook endpoints (BEFORE validation middleware - they're exempted internally)
    app.post("/api/webhooks/test", (_req, res) => {
      res.json({ message: "Webhook processed", success: true });
    });

    // Apply CSRF validation to API routes
    // This will skip webhooks and public endpoints internally via validateCsrfToken logic
    app.use("/api", validateCsrfToken);

    // Test routes
    app.get("/api/public", (_req, res) => {
      res.json({ message: "Public GET endpoint" });
    });

    app.post("/api/protected", (_req, res) => {
      res.json({ message: "Protected POST endpoint", success: true });
    });

    app.put("/api/protected/:id", (_req, res) => {
      res.json({ message: "Protected PUT endpoint", success: true });
    });

    app.delete("/api/protected/:id", (_req, res) => {
      res.json({ message: "Protected DELETE endpoint", success: true });
    });

    // Public widget endpoint (exempted internally by validateCsrfToken)
    app.post("/api/chat/widget", (_req, res) => {
      res.json({ message: "Widget message processed", success: true });
    });
  });

  describe("Token Generation", () => {
    it("should set CSRF token cookies on first request", async () => {
      const response = await request(app)
        .get("/api/public")
        .expect(200);

      // Check that both cookies are set
      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
      expect(cookies.length).toBeGreaterThanOrEqual(2);

      // Find the CSRF cookies
      const hostCookie = cookies.find((c: string) => c.startsWith("__Host-csrf-token="));
      const readableCookie = cookies.find((c: string) => c.startsWith("csrf-token-readable="));

      expect(hostCookie).toBeDefined();
      expect(readableCookie).toBeDefined();

      // Verify cookie attributes
      expect(hostCookie).toContain("HttpOnly");
      expect(hostCookie).toContain("SameSite=Strict");
      expect(readableCookie).toContain("SameSite=Strict");
    });

    it("should return token via /api/csrf-token endpoint", async () => {
      // First request to get cookies
      const firstResponse = await request(app)
        .get("/api/public")
        .expect(200);

      const cookies = firstResponse.headers["set-cookie"];
      const cookieHeader = cookies.join("; ");

      // Second request to get token via endpoint
      const response = await request(app)
        .get("/api/csrf-token")
        .set("Cookie", cookieHeader)
        .expect(200);

      expect(response.body).toHaveProperty("csrfToken");
      expect(typeof response.body.csrfToken).toBe("string");
      expect(response.body.csrfToken.length).toBeGreaterThan(0);
    });

    it("should return error from /api/csrf-token if no cookie exists", async () => {
      const response = await request(app)
        .get("/api/csrf-token")
        .expect(400);

      expect(response.body).toHaveProperty("code", "CSRF_TOKEN_NOT_FOUND");
      expect(response.body).toHaveProperty("message");
    });
  });

  describe("GET Requests (Safe Methods)", () => {
    it("should allow GET requests without CSRF token", async () => {
      await request(app)
        .get("/api/public")
        .expect(200);
    });

    it("should allow GET requests even without cookies", async () => {
      const response = await request(app)
        .get("/api/public")
        .expect(200);

      expect(response.body).toHaveProperty("message", "Public GET endpoint");
    });
  });

  describe("POST Requests (State-Changing)", () => {
    it("should reject POST request without CSRF token", async () => {
      const response = await request(app)
        .post("/api/protected")
        .send({ data: "test" })
        .expect(403);

      expect(response.body).toHaveProperty("code", "CSRF_TOKEN_MISSING");
      expect(response.body.message).toContain("cookie");
    });

    it("should reject POST request with cookie but without header", async () => {
      // First request to get cookies
      const firstResponse = await request(app)
        .get("/api/public")
        .expect(200);

      const cookies = firstResponse.headers["set-cookie"];
      const cookieHeader = cookies.join("; ");

      // POST request with cookies but no header
      const response = await request(app)
        .post("/api/protected")
        .set("Cookie", cookieHeader)
        .send({ data: "test" })
        .expect(403);

      expect(response.body).toHaveProperty("code", "CSRF_TOKEN_MISSING");
      expect(response.body.message).toContain("header");
    });

    it("should reject POST request with mismatched tokens", async () => {
      // First request to get cookies
      const firstResponse = await request(app)
        .get("/api/public")
        .expect(200);

      const cookies = firstResponse.headers["set-cookie"];
      const cookieHeader = cookies.join("; ");

      // POST request with wrong token in header
      const response = await request(app)
        .post("/api/protected")
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", "wrong-token-12345")
        .send({ data: "test" })
        .expect(403);

      expect(response.body).toHaveProperty("code", "CSRF_TOKEN_INVALID");
    });

    it("should accept POST request with valid CSRF token", async () => {
      // First request to get cookies
      const firstResponse = await request(app)
        .get("/api/public")
        .expect(200);

      const cookies = firstResponse.headers["set-cookie"];
      const cookieHeader = cookies.join("; ");

      // Extract token from readable cookie
      const readableCookie = cookies.find((c: string) => c.startsWith("csrf-token-readable="));
      const token = readableCookie?.split(";")[0].split("=")[1];

      expect(token).toBeDefined();

      // POST request with valid token
      const response = await request(app)
        .post("/api/protected")
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", token!)
        .send({ data: "test" })
        .expect(200);

      expect(response.body).toHaveProperty("success", true);
      expect(response.body).toHaveProperty("message", "Protected POST endpoint");
    });
  });

  describe("PUT/DELETE Requests", () => {
    it("should protect PUT requests with CSRF validation", async () => {
      // Get token first
      const firstResponse = await request(app)
        .get("/api/public")
        .expect(200);

      const cookies = firstResponse.headers["set-cookie"];
      const cookieHeader = cookies.join("; ");
      const readableCookie = cookies.find((c: string) => c.startsWith("csrf-token-readable="));
      const token = readableCookie?.split(";")[0].split("=")[1];

      // PUT request with valid token
      const response = await request(app)
        .put("/api/protected/123")
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", token!)
        .send({ data: "updated" })
        .expect(200);

      expect(response.body).toHaveProperty("success", true);
    });

    it("should protect DELETE requests with CSRF validation", async () => {
      // Get token first
      const firstResponse = await request(app)
        .get("/api/public")
        .expect(200);

      const cookies = firstResponse.headers["set-cookie"];
      const cookieHeader = cookies.join("; ");
      const readableCookie = cookies.find((c: string) => c.startsWith("csrf-token-readable="));
      const token = readableCookie?.split(";")[0].split("=")[1];

      // DELETE request with valid token
      const response = await request(app)
        .delete("/api/protected/123")
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", token!)
        .expect(200);

      expect(response.body).toHaveProperty("success", true);
    });

    it("should reject DELETE without token", async () => {
      const response = await request(app)
        .delete("/api/protected/123")
        .expect(403);

      expect(response.body).toHaveProperty("code", "CSRF_TOKEN_MISSING");
    });
  });

  describe("Exempted Endpoints", () => {
    it("should allow webhook POST without CSRF token", async () => {
      const response = await request(app)
        .post("/api/webhooks/test")
        .send({ event: "test" })
        .expect(200);

      expect(response.body).toHaveProperty("success", true);
      expect(response.body).toHaveProperty("message", "Webhook processed");
    });

    it("should allow widget endpoint POST without CSRF token", async () => {
      const response = await request(app)
        .post("/api/chat/widget")
        .send({ message: "Hello" });

      // Debug: log the actual response if it fails
      if (response.status !== 200) {
        console.log("Widget endpoint failed:", response.status, response.body);
      }

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("success", true);
      expect(response.body).toHaveProperty("message", "Widget message processed");
    });
  });

  describe("Token Reuse", () => {
    it("should allow multiple requests with same token", async () => {
      // Get token first
      const firstResponse = await request(app)
        .get("/api/public")
        .expect(200);

      const cookies = firstResponse.headers["set-cookie"];
      const cookieHeader = cookies.join("; ");
      const readableCookie = cookies.find((c: string) => c.startsWith("csrf-token-readable="));
      const token = readableCookie?.split(";")[0].split("=")[1];

      // First POST request
      await request(app)
        .post("/api/protected")
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", token!)
        .send({ data: "test1" })
        .expect(200);

      // Second POST request with same token (should still work)
      await request(app)
        .post("/api/protected")
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", token!)
        .send({ data: "test2" })
        .expect(200);

      // Third request with different method
      await request(app)
        .put("/api/protected/1")
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", token!)
        .send({ data: "test3" })
        .expect(200);
    });
  });

  describe("Real-world Scenario", () => {
    it("should handle complete user session flow", async () => {
      // 1. User visits the site (GET request)
      const visitResponse = await request(app)
        .get("/api/public")
        .expect(200);

      const cookies = visitResponse.headers["set-cookie"];
      expect(cookies).toBeDefined();

      // 2. Extract cookies and token
      const cookieHeader = cookies.join("; ");
      const readableCookie = cookies.find((c: string) => c.startsWith("csrf-token-readable="));
      const token = readableCookie?.split(";")[0].split("=")[1];
      expect(token).toBeDefined();

      // 3. User submits a form (POST request with token)
      const createResponse = await request(app)
        .post("/api/protected")
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", token!)
        .send({ name: "Test Item" })
        .expect(200);

      expect(createResponse.body.success).toBe(true);

      // 4. User updates the item (PUT request with same token)
      const updateResponse = await request(app)
        .put("/api/protected/123")
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", token!)
        .send({ name: "Updated Item" })
        .expect(200);

      expect(updateResponse.body.success).toBe(true);

      // 5. User deletes the item (DELETE request with same token)
      const deleteResponse = await request(app)
        .delete("/api/protected/123")
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", token!)
        .expect(200);

      expect(deleteResponse.body.success).toBe(true);
    });

    it("should prevent CSRF attack scenario", async () => {
      // Legitimate user gets a token
      const userResponse = await request(app)
        .get("/api/public")
        .expect(200);

      const userCookies = userResponse.headers["set-cookie"];

      // Attacker tries to forge a request
      // They can't read the user's cookies or set custom headers due to browser security
      // This simulates the attacker trying to make a request without the token
      const attackResponse = await request(app)
        .post("/api/protected")
        .send({ malicious: "data" })
        .expect(403);

      expect(attackResponse.body.code).toBe("CSRF_TOKEN_MISSING");

      // Even if attacker somehow gets cookies, they can't set the header
      const attackResponse2 = await request(app)
        .post("/api/protected")
        .set("Cookie", userCookies.join("; "))
        // No X-CSRF-Token header - attacker can't set custom headers in cross-origin request
        .send({ malicious: "data" })
        .expect(403);

      expect(attackResponse2.body.code).toBe("CSRF_TOKEN_MISSING");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty token gracefully", async () => {
      const response = await request(app)
        .post("/api/protected")
        .set("X-CSRF-Token", "")
        .send({ data: "test" })
        .expect(403);

      expect(response.body.code).toBe("CSRF_TOKEN_MISSING");
    });

    it("should handle very long token strings", async () => {
      const firstResponse = await request(app)
        .get("/api/public")
        .expect(200);

      const cookies = firstResponse.headers["set-cookie"];
      const cookieHeader = cookies.join("; ");

      const longToken = "a".repeat(10000);

      const response = await request(app)
        .post("/api/protected")
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", longToken)
        .send({ data: "test" })
        .expect(403);

      expect(response.body.code).toBe("CSRF_TOKEN_INVALID");
    });

    it("should handle special characters in token", async () => {
      const firstResponse = await request(app)
        .get("/api/public")
        .expect(200);

      const cookies = firstResponse.headers["set-cookie"];
      const cookieHeader = cookies.join("; ");

      const specialToken = "<script>alert('xss')</script>";

      const response = await request(app)
        .post("/api/protected")
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", specialToken)
        .send({ data: "test" })
        .expect(403);

      expect(response.body.code).toBe("CSRF_TOKEN_INVALID");
    });
  });
});
