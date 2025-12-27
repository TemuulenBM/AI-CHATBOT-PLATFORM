import { describe, it, expect } from "vitest";
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  UsageLimitError,
  ExternalServiceError,
} from "../../server/utils/errors";

describe("Error Classes", () => {
  describe("AppError", () => {
    it("should create error with default values", () => {
      const error = new AppError("Test error");

      expect(error.message).toBe("Test error");
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe("INTERNAL_ERROR");
      expect(error.isOperational).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it("should create error with custom values", () => {
      const error = new AppError("Custom error", 418, "TEAPOT", false);

      expect(error.message).toBe("Custom error");
      expect(error.statusCode).toBe(418);
      expect(error.code).toBe("TEAPOT");
      expect(error.isOperational).toBe(false);
    });

    it("should have a stack trace", () => {
      const error = new AppError("Test error");
      expect(error.stack).toBeDefined();
    });
  });

  describe("ValidationError", () => {
    it("should create error with correct defaults", () => {
      const error = new ValidationError("Invalid input");

      expect(error.message).toBe("Invalid input");
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.isOperational).toBe(true);
      expect(error instanceof AppError).toBe(true);
    });
  });

  describe("AuthenticationError", () => {
    it("should create error with default message", () => {
      const error = new AuthenticationError();

      expect(error.message).toBe("Authentication required");
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe("AUTHENTICATION_ERROR");
    });

    it("should create error with custom message", () => {
      const error = new AuthenticationError("Invalid token");

      expect(error.message).toBe("Invalid token");
      expect(error.statusCode).toBe(401);
    });
  });

  describe("AuthorizationError", () => {
    it("should create error with default message", () => {
      const error = new AuthorizationError();

      expect(error.message).toBe("Access denied");
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe("AUTHORIZATION_ERROR");
    });

    it("should create error with custom message", () => {
      const error = new AuthorizationError("Insufficient permissions");

      expect(error.message).toBe("Insufficient permissions");
    });
  });

  describe("NotFoundError", () => {
    it("should create error with default resource name", () => {
      const error = new NotFoundError();

      expect(error.message).toBe("Resource not found");
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe("NOT_FOUND");
    });

    it("should create error with custom resource name", () => {
      const error = new NotFoundError("Chatbot");

      expect(error.message).toBe("Chatbot not found");
    });
  });

  describe("RateLimitError", () => {
    it("should create error with default message", () => {
      const error = new RateLimitError();

      expect(error.message).toBe("Too many requests");
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("should create error with custom message", () => {
      const error = new RateLimitError("Slow down!");

      expect(error.message).toBe("Slow down!");
    });
  });

  describe("UsageLimitError", () => {
    it("should create error with default message", () => {
      const error = new UsageLimitError();

      expect(error.message).toBe("Usage limit exceeded");
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe("USAGE_LIMIT_EXCEEDED");
    });

    it("should create error with custom message", () => {
      const error = new UsageLimitError("Message limit reached");

      expect(error.message).toBe("Message limit reached");
    });
  });

  describe("ExternalServiceError", () => {
    it("should create error with service name and message", () => {
      const error = new ExternalServiceError("Paddle", "Payment failed");

      expect(error.message).toBe("Paddle error: Payment failed");
      expect(error.statusCode).toBe(502);
      expect(error.code).toBe("EXTERNAL_SERVICE_ERROR");
    });
  });

  describe("Error Inheritance Chain", () => {
    it("all custom errors should be instances of Error", () => {
      const errors = [
        new ValidationError("test"),
        new AuthenticationError(),
        new AuthorizationError(),
        new NotFoundError(),
        new RateLimitError(),
        new UsageLimitError(),
        new ExternalServiceError("Test", "test"),
      ];

      errors.forEach((error) => {
        expect(error instanceof Error).toBe(true);
        expect(error instanceof AppError).toBe(true);
      });
    });
  });
});
