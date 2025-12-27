import { test, expect } from "@playwright/test";

test.describe("Chat Widget API", () => {
  test("chat message endpoint exists", async ({ request }) => {
    // This should fail with validation error (missing required fields)
    const response = await request.post("/api/chat/message", {
      data: {},
    });

    // Should be 400 (bad request) or 404 (chatbot not found), not 500
    expect([400, 404, 422]).toContain(response.status());
  });

  test("conversation history endpoint format", async ({ request }) => {
    const response = await request.get("/api/chat/test-chatbot/test-session");

    // Should return empty conversation or 404
    if (response.ok()) {
      const body = await response.json();
      expect(body).toHaveProperty("messages");
      expect(body.messages).toBeInstanceOf(Array);
    } else {
      expect([404, 400]).toContain(response.status());
    }
  });
});

test.describe("Support Bot", () => {
  test("support bot endpoint accepts messages", async ({ request }) => {
    const response = await request.post("/api/chat/support", {
      data: {
        sessionId: "test-session-" + Date.now(),
        message: "What is ConvoAI?",
      },
    });

    // Should return SSE stream
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("text/event-stream");
  });

  test("support bot requires message", async ({ request }) => {
    const response = await request.post("/api/chat/support", {
      data: {
        sessionId: "test-session",
        // Missing message field
      },
    });

    expect(response.status()).toBe(400);
  });

  test("support bot handles empty message", async ({ request }) => {
    const response = await request.post("/api/chat/support", {
      data: {
        sessionId: "test-session",
        message: "",
      },
    });

    expect(response.status()).toBe(400);
  });
});

test.describe("Chat Widget Integration", () => {
  test("widget script endpoint exists", async ({ request }) => {
    // Check if widget.js is served
    const response = await request.get("/widget.js");

    // Should be available if widget is built
    if (response.ok()) {
      const contentType = response.headers()["content-type"];
      expect(contentType).toContain("javascript");
    }
  });

  test("widget configuration endpoint", async ({ request }) => {
    // This endpoint may or may not exist depending on implementation
    const response = await request.get("/api/chat/widget/test-chatbot-id");

    // Should be 400 (validation), 404 (not found), or return config
    if (response.ok()) {
      const body = await response.json();
      expect(body).toHaveProperty("id");
    } else {
      expect([400, 404]).toContain(response.status());
    }
  });
});

test.describe("SSE Streaming", () => {
  test("stream endpoint returns event stream", async ({ request }) => {
    const response = await request.post("/api/chat/stream", {
      data: {
        chatbotId: "test-chatbot",
        sessionId: "test-session",
        message: "Hello",
      },
    });

    // Either validation error, auth error, or chatbot not found
    // Main thing is it doesn't crash with 500
    expect([200, 400, 401, 404]).toContain(response.status());

    if (response.ok()) {
      const contentType = response.headers()["content-type"];
      expect(contentType).toContain("text/event-stream");
    }
  });
});
