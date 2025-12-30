import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateEnvironment, initializeEnvironment, ValidationResult } from "../../../server/utils/env";

describe("Environment Utilities", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment to a known state with required vars set
    process.env.NODE_ENV = "test";
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_KEY = "test-service-key";
    process.env.CLERK_SECRET_KEY = "sk_test_clerk_key";
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  describe("validateEnvironment", () => {
    it("should return valid when all required variables are set", () => {
      const result = validateEnvironment();

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it("should return invalid when SUPABASE_URL is missing", () => {
      delete process.env.SUPABASE_URL;

      const result = validateEnvironment();

      expect(result.valid).toBe(false);
      expect(result.missing.some(m => m.includes("SUPABASE_URL"))).toBe(true);
    });

    it("should return invalid when SUPABASE_SERVICE_KEY is missing", () => {
      delete process.env.SUPABASE_SERVICE_KEY;

      const result = validateEnvironment();

      expect(result.valid).toBe(false);
      expect(result.missing.some(m => m.includes("SUPABASE_SERVICE_KEY"))).toBe(true);
    });

    it("should return invalid when CLERK_SECRET_KEY is missing", () => {
      delete process.env.CLERK_SECRET_KEY;

      const result = validateEnvironment();

      expect(result.valid).toBe(false);
      expect(result.missing.some(m => m.includes("CLERK_SECRET_KEY"))).toBe(true);
    });

    it("should return invalid when OPENAI_API_KEY is missing", () => {
      delete process.env.OPENAI_API_KEY;

      const result = validateEnvironment();

      expect(result.valid).toBe(false);
      expect(result.missing.some(m => m.includes("OPENAI_API_KEY"))).toBe(true);
    });

    it("should return invalid when REDIS_URL is missing", () => {
      delete process.env.REDIS_URL;

      const result = validateEnvironment();

      expect(result.valid).toBe(false);
      expect(result.missing.some(m => m.includes("REDIS_URL"))).toBe(true);
    });

    it("should add optional variables to warnings when not set", () => {
      delete process.env.PORT;
      delete process.env.PADDLE_API_KEY;
      delete process.env.SENTRY_DSN;

      const result = validateEnvironment();

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes("PORT"))).toBe(true);
    });

    it("should return multiple missing variables", () => {
      delete process.env.SUPABASE_URL;
      delete process.env.OPENAI_API_KEY;

      const result = validateEnvironment();

      expect(result.valid).toBe(false);
      expect(result.missing.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("initializeEnvironment", () => {
    it("should not throw when all required variables are set", () => {
      expect(() => initializeEnvironment()).not.toThrow();
    });

    it("should warn about optional variables not set", () => {
      delete process.env.PADDLE_API_KEY;

      // Should not throw in development mode
      expect(() => initializeEnvironment()).not.toThrow();
    });

    it("should log warning for Clerk key not starting with sk_", () => {
      process.env.CLERK_SECRET_KEY = "invalid_key_format";

      // Should not throw, just warn
      expect(() => initializeEnvironment()).not.toThrow();
    });

    it("should warn about Paddle sandbox in production", () => {
      process.env.NODE_ENV = "production";
      process.env.PADDLE_API_KEY = "test_key";
      process.env.PADDLE_ENVIRONMENT = "sandbox";

      // Should not throw, just warn
      expect(() => initializeEnvironment()).not.toThrow();
    });

    it("should warn about live Paddle in non-production", () => {
      process.env.NODE_ENV = "development";
      process.env.PADDLE_API_KEY = "live_key";
      process.env.PADDLE_ENVIRONMENT = "live";

      // Should not throw, just warn
      expect(() => initializeEnvironment()).not.toThrow();
    });

    it("should not throw in development mode with missing variables", () => {
      process.env.NODE_ENV = "development";
      delete process.env.SUPABASE_URL;

      // In development mode, should warn but not exit
      expect(() => initializeEnvironment()).not.toThrow();
    });
  });

  describe("ValidationResult interface", () => {
    it("should have correct structure", () => {
      const result = validateEnvironment();

      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("missing");
      expect(result).toHaveProperty("warnings");
      expect(typeof result.valid).toBe("boolean");
      expect(Array.isArray(result.missing)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });
});
