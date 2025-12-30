import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import { validate, schemas } from "../../../server/middleware/validation";
import { ValidationError } from "../../../server/utils/errors";

// Mock request factory
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    query: {},
    params: {},
    ...overrides,
  } as Request;
}

// Mock response factory
function createMockResponse(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe("Validation Middleware", () => {
  let mockNext: NextFunction;

  beforeEach(() => {
    mockNext = vi.fn();
  });

  describe("validate function", () => {
    it("should call next() when body validation passes", async () => {
      const req = createMockRequest({
        body: {
          name: "Test Chatbot",
          websiteUrl: "https://example.com",
        },
      });
      const res = createMockResponse();

      const middleware = validate({ body: schemas.createChatbot });
      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(req.body.name).toBe("Test Chatbot");
    });

    it("should call next with ValidationError when body validation fails", async () => {
      const req = createMockRequest({
        body: {
          name: "", // Invalid: empty name
          websiteUrl: "not-a-url",
        },
      });
      const res = createMockResponse();

      const middleware = validate({ body: schemas.createChatbot });
      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
    });

    it("should validate query parameters", async () => {
      const req = createMockRequest({
        query: {
          page: "1",
          limit: "20",
        },
      });
      const res = createMockResponse();

      const middleware = validate({ query: schemas.conversationsQuery });
      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(req.query.page).toBe(1);
      expect(req.query.limit).toBe(20);
    });

    it("should fail query validation for invalid page", async () => {
      const req = createMockRequest({
        query: {
          page: "-1",
          limit: "20",
        },
      });
      const res = createMockResponse();

      const middleware = validate({ query: schemas.conversationsQuery });
      await middleware(req, res, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
    });

    it("should validate params", async () => {
      const req = createMockRequest({
        params: {
          id: "123e4567-e89b-12d3-a456-426614174000",
        },
      });
      const res = createMockResponse();

      const middleware = validate({ params: schemas.uuidParam });
      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should fail params validation for invalid UUID", async () => {
      const req = createMockRequest({
        params: {
          id: "not-a-uuid",
        },
      });
      const res = createMockResponse();

      const middleware = validate({ params: schemas.uuidParam });
      await middleware(req, res, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
    });

    it("should validate multiple schemas at once", async () => {
      const req = createMockRequest({
        body: {
          name: "Test Chatbot",
          websiteUrl: "https://example.com",
        },
        params: {
          id: "123e4567-e89b-12d3-a456-426614174000",
        },
      });
      const res = createMockResponse();

      const middleware = validate({
        body: schemas.createChatbot,
        params: schemas.uuidParam,
      });
      await middleware(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe("schemas.createChatbot", () => {
    it("should validate a valid chatbot creation request", () => {
      const result = schemas.createChatbot.safeParse({
        name: "My Chatbot",
        websiteUrl: "https://example.com",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("My Chatbot");
        expect(result.data.settings.personality).toBe(50); // default
        expect(result.data.settings.primaryColor).toBe("#7c3aed"); // default
      }
    });

    it("should reject name longer than 100 characters", () => {
      const result = schemas.createChatbot.safeParse({
        name: "a".repeat(101),
        websiteUrl: "https://example.com",
      });

      expect(result.success).toBe(false);
    });

    it("should reject invalid URL", () => {
      const result = schemas.createChatbot.safeParse({
        name: "Test",
        websiteUrl: "not-a-url",
      });

      expect(result.success).toBe(false);
    });

    it("should validate custom settings", () => {
      const result = schemas.createChatbot.safeParse({
        name: "Test",
        websiteUrl: "https://example.com",
        settings: {
          personality: 75,
          primaryColor: "#ff0000",
          welcomeMessage: "Welcome!",
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.settings.personality).toBe(75);
        expect(result.data.settings.primaryColor).toBe("#ff0000");
      }
    });

    it("should reject personality outside range", () => {
      const result = schemas.createChatbot.safeParse({
        name: "Test",
        websiteUrl: "https://example.com",
        settings: {
          personality: 150, // Invalid: > 100
        },
      });

      expect(result.success).toBe(false);
    });

    it("should reject invalid color format", () => {
      const result = schemas.createChatbot.safeParse({
        name: "Test",
        websiteUrl: "https://example.com",
        settings: {
          primaryColor: "red", // Invalid: not hex format
        },
      });

      expect(result.success).toBe(false);
    });
  });

  describe("schemas.updateChatbot", () => {
    it("should allow partial updates", () => {
      const result = schemas.updateChatbot.safeParse({
        name: "Updated Name",
      });

      expect(result.success).toBe(true);
    });

    it("should allow empty object", () => {
      const result = schemas.updateChatbot.safeParse({});

      expect(result.success).toBe(true);
    });

    it("should validate widget v2.0 settings", () => {
      const result = schemas.updateChatbot.safeParse({
        settings: {
          position: "bottom-left",
          widgetSize: "large",
          headerStyle: "gradient",
          animationStyle: "bounce",
        },
      });

      expect(result.success).toBe(true);
    });

    it("should validate preChatForm settings", () => {
      const result = schemas.updateChatbot.safeParse({
        settings: {
          preChatForm: {
            enabled: true,
            title: "Contact Form",
            fields: [
              {
                id: "email",
                type: "email",
                label: "Email",
                required: true,
              },
            ],
          },
        },
      });

      expect(result.success).toBe(true);
    });

    it("should validate proactive triggers", () => {
      const result = schemas.updateChatbot.safeParse({
        settings: {
          proactiveTriggers: [
            {
              id: "trigger1",
              type: "time",
              value: 5000,
              message: "Need help?",
              enabled: true,
            },
          ],
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe("schemas.chatMessage", () => {
    it("should validate a valid chat message", () => {
      const result = schemas.chatMessage.safeParse({
        chatbotId: "123e4567-e89b-12d3-a456-426614174000",
        sessionId: "session123",
        message: "Hello, how are you?",
      });

      expect(result.success).toBe(true);
    });

    it("should reject invalid chatbotId", () => {
      const result = schemas.chatMessage.safeParse({
        chatbotId: "not-a-uuid",
        sessionId: "session123",
        message: "Hello",
      });

      expect(result.success).toBe(false);
    });

    it("should reject empty message", () => {
      const result = schemas.chatMessage.safeParse({
        chatbotId: "123e4567-e89b-12d3-a456-426614174000",
        sessionId: "session123",
        message: "",
      });

      expect(result.success).toBe(false);
    });

    it("should reject message longer than 4000 characters", () => {
      const result = schemas.chatMessage.safeParse({
        chatbotId: "123e4567-e89b-12d3-a456-426614174000",
        sessionId: "session123",
        message: "a".repeat(4001),
      });

      expect(result.success).toBe(false);
    });
  });

  describe("schemas.createCheckout", () => {
    it("should validate a valid checkout request", () => {
      const result = schemas.createCheckout.safeParse({
        plan: "starter",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      });

      expect(result.success).toBe(true);
    });

    it("should reject invalid plan", () => {
      const result = schemas.createCheckout.safeParse({
        plan: "invalid-plan",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      });

      expect(result.success).toBe(false);
    });

    it("should validate all plan types", () => {
      const plans = ["starter", "growth", "business"];

      plans.forEach((plan) => {
        const result = schemas.createCheckout.safeParse({
          plan,
          successUrl: "https://example.com/success",
          cancelUrl: "https://example.com/cancel",
        });

        expect(result.success).toBe(true);
      });
    });
  });

  describe("schemas.scrapeSchedule", () => {
    it("should validate a valid scrape schedule", () => {
      const result = schemas.scrapeSchedule.safeParse({
        autoScrapeEnabled: true,
        scrapeFrequency: "weekly",
      });

      expect(result.success).toBe(true);
    });

    it("should validate all frequency options", () => {
      const frequencies = ["manual", "daily", "weekly", "monthly"];

      frequencies.forEach((freq) => {
        const result = schemas.scrapeSchedule.safeParse({
          autoScrapeEnabled: true,
          scrapeFrequency: freq,
        });

        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid frequency", () => {
      const result = schemas.scrapeSchedule.safeParse({
        autoScrapeEnabled: true,
        scrapeFrequency: "hourly", // Invalid
      });

      expect(result.success).toBe(false);
    });
  });

  describe("schemas.conversationsQuery", () => {
    it("should use defaults when not provided", () => {
      const result = schemas.conversationsQuery.safeParse({});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });

    it("should transform string numbers", () => {
      const result = schemas.conversationsQuery.safeParse({
        page: "5",
        limit: "10",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(5);
        expect(result.data.limit).toBe(10);
      }
    });

    it("should reject limit over 50", () => {
      const result = schemas.conversationsQuery.safeParse({
        limit: "100",
      });

      expect(result.success).toBe(false);
    });

    it("should validate optional chatbotId as UUID", () => {
      const result = schemas.conversationsQuery.safeParse({
        chatbotId: "123e4567-e89b-12d3-a456-426614174000",
      });

      expect(result.success).toBe(true);
    });

    it("should reject invalid chatbotId format", () => {
      const result = schemas.conversationsQuery.safeParse({
        chatbotId: "not-a-uuid",
      });

      expect(result.success).toBe(false);
    });

    it("should transform empty chatbotId to undefined", () => {
      const result = schemas.conversationsQuery.safeParse({
        chatbotId: "",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.chatbotId).toBeUndefined();
      }
    });
  });
});
