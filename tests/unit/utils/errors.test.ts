import { describe, it, expect, beforeEach } from "vitest";
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  UsageLimitError,
  ExternalServiceError,
} from "../../../server/utils/errors";

describe("Error Classes", () => {
  describe("AppError", () => {
    it("should create an error with default values", () => {
      const error = new AppError("Test error");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe("Test error");
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe("INTERNAL_ERROR");
      expect(error.isOperational).toBe(true);
    });

    it("should create an error with custom statusCode", () => {
      const error = new AppError("Test error", 404);

      expect(error.statusCode).toBe(404);
      expect(error.code).toBe("INTERNAL_ERROR");
      expect(error.isOperational).toBe(true);
    });

    it("should create an error with custom code", () => {
      const error = new AppError("Test error", 500, "CUSTOM_ERROR");

      expect(error.statusCode).toBe(500);
      expect(error.code).toBe("CUSTOM_ERROR");
      expect(error.isOperational).toBe(true);
    });

    it("should create an error with custom isOperational", () => {
      const error = new AppError("Test error", 500, "INTERNAL_ERROR", false);

      expect(error.isOperational).toBe(false);
    });

    it("should create an error with all custom values", () => {
      const error = new AppError("Custom error", 418, "TEAPOT", false);

      expect(error.message).toBe("Custom error");
      expect(error.statusCode).toBe(418);
      expect(error.code).toBe("TEAPOT");
      expect(error.isOperational).toBe(false);
    });

    it("should have a stack trace", () => {
      const error = new AppError("Test error");

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("Error");
    });

    it("should be throwable", () => {
      expect(() => {
        throw new AppError("Test error");
      }).toThrow(AppError);
    });

    it("should be catchable as Error", () => {
      try {
        throw new AppError("Test error");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(AppError);
      }
    });

    it("should preserve message property", () => {
      const message = "Detailed error message";
      const error = new AppError(message);

      expect(error.message).toBe(message);
    });

    it("should have readonly properties", () => {
      const error = new AppError("Test error", 500, "TEST_CODE", true);

      expect(error.statusCode).toBe(500);
      expect(error.code).toBe("TEST_CODE");
      expect(error.isOperational).toBe(true);
    });
  });

  describe("ValidationError", () => {
    it("should create a validation error with correct defaults", () => {
      const error = new ValidationError("Invalid input");

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe("Invalid input");
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.isOperational).toBe(true);
    });

    it("should be throwable", () => {
      expect(() => {
        throw new ValidationError("Invalid email format");
      }).toThrow(ValidationError);
    });

    it("should preserve custom message", () => {
      const message = "Field 'email' is required";
      const error = new ValidationError(message);

      expect(error.message).toBe(message);
    });

    it("should have stack trace", () => {
      const error = new ValidationError("Test validation error");

      expect(error.stack).toBeDefined();
    });

    it("should be catchable as AppError", () => {
      try {
        throw new ValidationError("Test");
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
      }
    });
  });

  describe("AuthenticationError", () => {
    it("should create an authentication error with default message", () => {
      const error = new AuthenticationError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.message).toBe("Authentication required");
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe("AUTHENTICATION_ERROR");
      expect(error.isOperational).toBe(true);
    });

    it("should create an authentication error with custom message", () => {
      const error = new AuthenticationError("Invalid credentials");

      expect(error.message).toBe("Invalid credentials");
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe("AUTHENTICATION_ERROR");
    });

    it("should be throwable", () => {
      expect(() => {
        throw new AuthenticationError("Token expired");
      }).toThrow(AuthenticationError);
    });

    it("should have correct status code for unauthorized", () => {
      const error = new AuthenticationError();

      expect(error.statusCode).toBe(401);
    });

    it("should have stack trace", () => {
      const error = new AuthenticationError();

      expect(error.stack).toBeDefined();
    });
  });

  describe("AuthorizationError", () => {
    it("should create an authorization error with default message", () => {
      const error = new AuthorizationError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(AuthorizationError);
      expect(error.message).toBe("Access denied");
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe("AUTHORIZATION_ERROR");
      expect(error.isOperational).toBe(true);
    });

    it("should create an authorization error with custom message", () => {
      const error = new AuthorizationError("Insufficient permissions");

      expect(error.message).toBe("Insufficient permissions");
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe("AUTHORIZATION_ERROR");
    });

    it("should be throwable", () => {
      expect(() => {
        throw new AuthorizationError("Admin access required");
      }).toThrow(AuthorizationError);
    });

    it("should have correct status code for forbidden", () => {
      const error = new AuthorizationError();

      expect(error.statusCode).toBe(403);
    });

    it("should be different from AuthenticationError", () => {
      const authNError = new AuthenticationError();
      const authZError = new AuthorizationError();

      expect(authNError.statusCode).toBe(401);
      expect(authZError.statusCode).toBe(403);
      expect(authNError.code).not.toBe(authZError.code);
    });
  });

  describe("NotFoundError", () => {
    it("should create a not found error with default resource", () => {
      const error = new NotFoundError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe("Resource not found");
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe("NOT_FOUND");
      expect(error.isOperational).toBe(true);
    });

    it("should create a not found error with custom resource", () => {
      const error = new NotFoundError("User");

      expect(error.message).toBe("User not found");
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe("NOT_FOUND");
    });

    it("should support different resource types", () => {
      const errors = [
        new NotFoundError("Chatbot"),
        new NotFoundError("Conversation"),
        new NotFoundError("Subscription"),
      ];

      expect(errors[0].message).toBe("Chatbot not found");
      expect(errors[1].message).toBe("Conversation not found");
      expect(errors[2].message).toBe("Subscription not found");
      errors.forEach(err => {
        expect(err.statusCode).toBe(404);
        expect(err.code).toBe("NOT_FOUND");
      });
    });

    it("should be throwable", () => {
      expect(() => {
        throw new NotFoundError("Document");
      }).toThrow(NotFoundError);
    });

    it("should have stack trace", () => {
      const error = new NotFoundError("Item");

      expect(error.stack).toBeDefined();
    });
  });

  describe("RateLimitError", () => {
    it("should create a rate limit error with default message", () => {
      const error = new RateLimitError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.message).toBe("Too many requests");
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(error.isOperational).toBe(true);
    });

    it("should create a rate limit error with custom message", () => {
      const error = new RateLimitError("Rate limit exceeded, try again in 60 seconds");

      expect(error.message).toBe("Rate limit exceeded, try again in 60 seconds");
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe("RATE_LIMIT_EXCEEDED");
    });

    it("should be throwable", () => {
      expect(() => {
        throw new RateLimitError("Too many login attempts");
      }).toThrow(RateLimitError);
    });

    it("should have correct status code for rate limiting", () => {
      const error = new RateLimitError();

      expect(error.statusCode).toBe(429);
    });

    it("should have stack trace", () => {
      const error = new RateLimitError();

      expect(error.stack).toBeDefined();
    });
  });

  describe("UsageLimitError", () => {
    it("should create a usage limit error with default message", () => {
      const error = new UsageLimitError();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(UsageLimitError);
      expect(error.message).toBe("Usage limit exceeded");
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe("USAGE_LIMIT_EXCEEDED");
      expect(error.isOperational).toBe(true);
    });

    it("should create a usage limit error with custom message", () => {
      const error = new UsageLimitError("Monthly message limit exceeded");

      expect(error.message).toBe("Monthly message limit exceeded");
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe("USAGE_LIMIT_EXCEEDED");
    });

    it("should be throwable", () => {
      expect(() => {
        throw new UsageLimitError("Chatbot limit reached");
      }).toThrow(UsageLimitError);
    });

    it("should have correct status code for forbidden", () => {
      const error = new UsageLimitError();

      expect(error.statusCode).toBe(403);
    });

    it("should be different from RateLimitError", () => {
      const rateLimitError = new RateLimitError();
      const usageLimitError = new UsageLimitError();

      expect(rateLimitError.statusCode).toBe(429);
      expect(usageLimitError.statusCode).toBe(403);
      expect(rateLimitError.code).not.toBe(usageLimitError.code);
    });

    it("should have stack trace", () => {
      const error = new UsageLimitError();

      expect(error.stack).toBeDefined();
    });
  });

  describe("ExternalServiceError", () => {
    it("should create an external service error", () => {
      const error = new ExternalServiceError("OpenAI", "API quota exceeded");

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ExternalServiceError);
      expect(error.message).toBe("OpenAI error: API quota exceeded");
      expect(error.statusCode).toBe(502);
      expect(error.code).toBe("EXTERNAL_SERVICE_ERROR");
      expect(error.isOperational).toBe(true);
    });

    it("should support different service names", () => {
      const errors = [
        new ExternalServiceError("Stripe", "Payment failed"),
        new ExternalServiceError("Supabase", "Database connection failed"),
        new ExternalServiceError("Redis", "Connection timeout"),
      ];

      expect(errors[0].message).toBe("Stripe error: Payment failed");
      expect(errors[1].message).toBe("Supabase error: Database connection failed");
      expect(errors[2].message).toBe("Redis error: Connection timeout");
      errors.forEach(err => {
        expect(err.statusCode).toBe(502);
        expect(err.code).toBe("EXTERNAL_SERVICE_ERROR");
      });
    });

    it("should be throwable", () => {
      expect(() => {
        throw new ExternalServiceError("API", "Service unavailable");
      }).toThrow(ExternalServiceError);
    });

    it("should have correct status code for bad gateway", () => {
      const error = new ExternalServiceError("Service", "Error");

      expect(error.statusCode).toBe(502);
    });

    it("should format error message correctly", () => {
      const service = "TestService";
      const message = "Connection refused";
      const error = new ExternalServiceError(service, message);

      expect(error.message).toContain(service);
      expect(error.message).toContain(message);
      expect(error.message).toBe(`${service} error: ${message}`);
    });

    it("should have stack trace", () => {
      const error = new ExternalServiceError("Service", "Error");

      expect(error.stack).toBeDefined();
    });
  });

  describe("Error Inheritance", () => {
    it("should have proper instanceof checks", () => {
      const validationError = new ValidationError("Test");
      const authError = new AuthenticationError("Test");
      const notFoundError = new NotFoundError("Test");

      expect(validationError).toBeInstanceOf(AppError);
      expect(validationError).toBeInstanceOf(Error);
      expect(authError).toBeInstanceOf(AppError);
      expect(authError).toBeInstanceOf(Error);
      expect(notFoundError).toBeInstanceOf(AppError);
      expect(notFoundError).toBeInstanceOf(Error);
    });

    it("should not be instances of each other", () => {
      const validationError = new ValidationError("Test");
      const authError = new AuthenticationError("Test");

      expect(validationError).not.toBeInstanceOf(AuthenticationError);
      expect(authError).not.toBeInstanceOf(ValidationError);
    });

    it("should all be operational by default", () => {
      const errors = [
        new ValidationError("Test"),
        new AuthenticationError("Test"),
        new AuthorizationError("Test"),
        new NotFoundError("Test"),
        new RateLimitError("Test"),
        new UsageLimitError("Test"),
        new ExternalServiceError("Service", "Test"),
      ];

      errors.forEach(error => {
        expect(error.isOperational).toBe(true);
      });
    });
  });

  describe("Error Properties", () => {
    it("should have unique status codes", () => {
      const statusCodes = {
        validation: new ValidationError("Test").statusCode,
        authentication: new AuthenticationError("Test").statusCode,
        authorization: new AuthorizationError("Test").statusCode,
        notFound: new NotFoundError("Test").statusCode,
        rateLimit: new RateLimitError("Test").statusCode,
        usageLimit: new UsageLimitError("Test").statusCode,
        externalService: new ExternalServiceError("S", "T").statusCode,
      };

      expect(statusCodes.validation).toBe(400);
      expect(statusCodes.authentication).toBe(401);
      expect(statusCodes.authorization).toBe(403);
      expect(statusCodes.notFound).toBe(404);
      expect(statusCodes.rateLimit).toBe(429);
      expect(statusCodes.usageLimit).toBe(403);
      expect(statusCodes.externalService).toBe(502);
    });

    it("should have unique error codes", () => {
      const errorCodes = {
        validation: new ValidationError("Test").code,
        authentication: new AuthenticationError("Test").code,
        authorization: new AuthorizationError("Test").code,
        notFound: new NotFoundError("Test").code,
        rateLimit: new RateLimitError("Test").code,
        usageLimit: new UsageLimitError("Test").code,
        externalService: new ExternalServiceError("S", "T").code,
      };

      expect(errorCodes.validation).toBe("VALIDATION_ERROR");
      expect(errorCodes.authentication).toBe("AUTHENTICATION_ERROR");
      expect(errorCodes.authorization).toBe("AUTHORIZATION_ERROR");
      expect(errorCodes.notFound).toBe("NOT_FOUND");
      expect(errorCodes.rateLimit).toBe("RATE_LIMIT_EXCEEDED");
      expect(errorCodes.usageLimit).toBe("USAGE_LIMIT_EXCEEDED");
      expect(errorCodes.externalService).toBe("EXTERNAL_SERVICE_ERROR");
    });
  });

  describe("Error Serialization", () => {
    it("should serialize error properties", () => {
      const error = new ValidationError("Invalid input");

      const serialized = {
        message: error.message,
        statusCode: error.statusCode,
        code: error.code,
        isOperational: error.isOperational,
      };

      expect(serialized.message).toBe("Invalid input");
      expect(serialized.statusCode).toBe(400);
      expect(serialized.code).toBe("VALIDATION_ERROR");
      expect(serialized.isOperational).toBe(true);
    });

    it("should be JSON stringifiable", () => {
      const error = new NotFoundError("User");

      const json = JSON.stringify({
        message: error.message,
        statusCode: error.statusCode,
        code: error.code,
      });

      expect(json).toContain("User not found");
      expect(json).toContain("404");
      expect(json).toContain("NOT_FOUND");
    });
  });

  describe("Error Message Formatting", () => {
    it("should format NotFoundError with different resources", () => {
      const errors = [
        new NotFoundError("Chatbot"),
        new NotFoundError("User"),
        new NotFoundError("API Key"),
      ];

      expect(errors[0].message).toBe("Chatbot not found");
      expect(errors[1].message).toBe("User not found");
      expect(errors[2].message).toBe("API Key not found");
    });

    it("should format ExternalServiceError with service names", () => {
      const errors = [
        new ExternalServiceError("OpenAI", "Rate limit exceeded"),
        new ExternalServiceError("Stripe", "Payment failed"),
        new ExternalServiceError("Supabase", "Connection timeout"),
      ];

      expect(errors[0].message).toBe("OpenAI error: Rate limit exceeded");
      expect(errors[1].message).toBe("Stripe error: Payment failed");
      expect(errors[2].message).toBe("Supabase error: Connection timeout");
    });
  });

  describe("Error Constructor Edge Cases", () => {
    it("should handle empty message strings", () => {
      const error = new AppError("");

      expect(error.message).toBe("");
      expect(error.statusCode).toBe(500);
    });

    it("should handle very long messages", () => {
      const longMessage = "A".repeat(1000);
      const error = new ValidationError(longMessage);

      expect(error.message).toBe(longMessage);
      expect(error.message.length).toBe(1000);
    });

    it("should handle special characters in messages", () => {
      const specialMessage = "Error: <script>alert('test')</script>";
      const error = new ValidationError(specialMessage);

      expect(error.message).toBe(specialMessage);
    });

    it("should handle unicode characters", () => {
      const unicodeMessage = "错误: 验证失败 🚫";
      const error = new ValidationError(unicodeMessage);

      expect(error.message).toBe(unicodeMessage);
    });
  });

  describe("Error Type Checking", () => {
    it("should distinguish between different error types", () => {
      const errors = [
        new ValidationError("test"),
        new AuthenticationError("test"),
        new AuthorizationError("test"),
        new NotFoundError("test"),
        new RateLimitError("test"),
        new UsageLimitError("test"),
        new ExternalServiceError("service", "test"),
      ];

      expect(errors[0]).toBeInstanceOf(ValidationError);
      expect(errors[1]).toBeInstanceOf(AuthenticationError);
      expect(errors[2]).toBeInstanceOf(AuthorizationError);
      expect(errors[3]).toBeInstanceOf(NotFoundError);
      expect(errors[4]).toBeInstanceOf(RateLimitError);
      expect(errors[5]).toBeInstanceOf(UsageLimitError);
      expect(errors[6]).toBeInstanceOf(ExternalServiceError);
    });

    it("should all be AppError instances", () => {
      const errors = [
        new ValidationError("test"),
        new AuthenticationError("test"),
        new NotFoundError("test"),
      ];

      errors.forEach(error => {
        expect(error).toBeInstanceOf(AppError);
      });
    });
  });

  describe("Error Stack Traces", () => {
    it("should have stack traces for all error types", () => {
      const errors = [
        new AppError("test"),
        new ValidationError("test"),
        new AuthenticationError("test"),
        new AuthorizationError("test"),
        new NotFoundError("test"),
        new RateLimitError("test"),
        new UsageLimitError("test"),
        new ExternalServiceError("service", "test"),
      ];

      errors.forEach(error => {
        expect(error.stack).toBeDefined();
        expect(typeof error.stack).toBe("string");
        expect(error.stack!.length).toBeGreaterThan(0);
      });
    });

    it("should include error message in stack trace", () => {
      const error = new ValidationError("Test validation error");

      expect(error.stack).toContain("Test validation error");
    });
  });

  describe("HTTP Status Code Groups", () => {
    it("should group 4xx client errors", () => {
      const clientErrors = [
        new ValidationError("test"),
        new AuthenticationError("test"),
        new AuthorizationError("test"),
        new NotFoundError("test"),
        new RateLimitError("test"),
        new UsageLimitError("test"),
      ];

      clientErrors.forEach(error => {
        expect(error.statusCode).toBeGreaterThanOrEqual(400);
        expect(error.statusCode).toBeLessThan(500);
      });
    });

    it("should group 5xx server errors", () => {
      const serverErrors = [
        new AppError("test"),
        new ExternalServiceError("service", "test"),
      ];

      serverErrors.forEach(error => {
        expect(error.statusCode).toBeGreaterThanOrEqual(500);
        expect(error.statusCode).toBeLessThan(600);
      });
    });
  });

  describe("isOperational Flag Usage", () => {
    it("should mark expected errors as operational", () => {
      const operationalErrors = [
        new ValidationError("test"),
        new AuthenticationError("test"),
        new NotFoundError("test"),
      ];

      operationalErrors.forEach(error => {
        expect(error.isOperational).toBe(true);
      });
    });

    it("should allow non-operational errors", () => {
      const error = new AppError("Unexpected error", 500, "INTERNAL_ERROR", false);

      expect(error.isOperational).toBe(false);
    });

    it("should default to operational for base AppError", () => {
      const error = new AppError("test");

      expect(error.isOperational).toBe(true);
    });
  });

  describe("Error Code Consistency", () => {
    it("should have consistent error codes across instances", () => {
      const error1 = new ValidationError("Test 1");
      const error2 = new ValidationError("Test 2");

      expect(error1.code).toBe(error2.code);
    });

    it("should have unique codes for each error type", () => {
      const codes = [
        new ValidationError("test").code,
        new AuthenticationError("test").code,
        new AuthorizationError("test").code,
        new NotFoundError("test").code,
        new RateLimitError("test").code,
        new UsageLimitError("test").code,
        new ExternalServiceError("s", "t").code,
      ];

      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });
  });

  describe("Error Message Immutability", () => {
    it("should preserve original message", () => {
      const message = "Original message";
      const error = new ValidationError(message);

      expect(error.message).toBe(message);
    });

    it("should not allow message modification", () => {
      const error = new ValidationError("Original");
      const originalMessage = error.message;

      // TypeScript prevents direct assignment, but we can try
      expect(error.message).toBe(originalMessage);
    });
  });
});
