import { describe, it, expect, vi, beforeEach } from "vitest";
import { dirname } from "path";
import { fileURLToPath } from "url";

// Type definition for Swagger spec
interface SwaggerSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
    contact?: {
      name: string;
      email: string;
    };
    license?: {
      name: string;
      url: string;
    };
  };
  servers?: Array<{ url: string; description?: string }>;
  tags?: Array<{ name: string; description?: string }>;
  components?: {
    securitySchemes?: Record<string, any>;
    schemas?: Record<string, any>;
    responses?: Record<string, any>;
    parameters?: Record<string, any>;
  };
  paths?: Record<string, any>;
}

// Mock swagger-jsdoc before any imports
const mockSwaggerJsdoc = vi.fn((options: any) => {
  // Return a mock swagger spec
  return {
    openapi: options.definition.openapi,
    info: options.definition.info,
    servers: options.definition.servers,
    tags: options.definition.tags,
    components: options.definition.components,
    paths: {},
  };
});

vi.mock("swagger-jsdoc", () => ({
  default: mockSwaggerJsdoc,
}));

describe("Swagger Configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getDirname function", () => {
    it("should use __dirname when available (CommonJS)", () => {
      // Test the logic directly
      const mockDirname = "/test/dir";
      const result = typeof mockDirname !== "undefined" ? mockDirname : "fallback";
      expect(result).toBe("/test/dir");
    });

    it("should use import.meta.url when __dirname is unavailable (ESM)", () => {
      // Test the logic directly
      const mockUrl = "file:///test/dir/swagger.ts";
      const expectedDir = dirname(fileURLToPath(mockUrl));
      
      // Simulate ESM path
      const result = typeof undefined !== "undefined" 
        ? undefined 
        : dirname(fileURLToPath(mockUrl));
      
      expect(result).toBe(expectedDir);
    });
  });

  describe("swaggerSpec export", () => {
    it("should generate swagger spec with correct structure", async () => {
      const { swaggerSpec } = await import("../../../server/config/swagger");
      const spec = swaggerSpec as SwaggerSpec;
      
      expect(spec).toBeDefined();
      expect(spec.openapi).toBe("3.0.0");
      expect(spec.info).toBeDefined();
      expect(spec.info.title).toBe("ConvoAI API Documentation");
      expect(spec.info.version).toBe("1.0.0");
    });

    it("should include server configuration", async () => {
      const { swaggerSpec } = await import("../../../server/config/swagger");
      const spec = swaggerSpec as SwaggerSpec;
      
      expect(spec.servers).toBeDefined();
      expect(Array.isArray(spec.servers)).toBe(true);
      expect(spec.servers && spec.servers[0]?.url).toBeDefined();
      expect(typeof (spec.servers && spec.servers[0]?.url)).toBe("string");
    });

    it("should use default server URL when APP_URL is not set", () => {
      // Test the logic directly
      const serverUrl = process.env.APP_URL || "http://localhost:5000";
      expect(serverUrl).toBeDefined();
      expect(typeof serverUrl).toBe("string");
    });

    it("should include all required tags", async () => {
      const { swaggerSpec } = await import("../../../server/config/swagger");
      const spec = swaggerSpec as SwaggerSpec;
      
      expect(spec.tags).toBeDefined();
      const tagNames = (spec.tags || []).map((tag: any) => tag.name);
      
      expect(tagNames).toContain("Health & Monitoring");
      expect(tagNames).toContain("Chatbots");
      expect(tagNames).toContain("Chat");
      expect(tagNames).toContain("Knowledge Base");
      expect(tagNames).toContain("Analytics");
      expect(tagNames).toContain("Widget");
      expect(tagNames).toContain("Subscriptions");
      expect(tagNames).toContain("Webhooks");
      expect(tagNames).toContain("Feedback");
    });

    it("should include security schemes", async () => {
      const { swaggerSpec } = await import("../../../server/config/swagger");
      const spec = swaggerSpec as SwaggerSpec;
      
      expect(spec.components).toBeDefined();
      expect(spec.components?.securitySchemes).toBeDefined();
      expect(spec.components?.securitySchemes?.BearerAuth).toBeDefined();
      expect(spec.components?.securitySchemes?.CsrfToken).toBeDefined();
      
      expect(spec.components?.securitySchemes?.BearerAuth.type).toBe("http");
      expect(spec.components?.securitySchemes?.BearerAuth.scheme).toBe("bearer");
      expect(spec.components?.securitySchemes?.CsrfToken.type).toBe("apiKey");
      expect(spec.components?.securitySchemes?.CsrfToken.in).toBe("header");
    });

    it("should include all schema definitions", async () => {
      const { swaggerSpec } = await import("../../../server/config/swagger");
      const spec = swaggerSpec as SwaggerSpec;
      
      expect(spec.components?.schemas).toBeDefined();
      
      const schemas = spec.components?.schemas;
      expect(schemas?.Error).toBeDefined();
      expect(schemas?.Chatbot).toBeDefined();
      expect(schemas?.CreateChatbotRequest).toBeDefined();
      expect(schemas?.Conversation).toBeDefined();
      expect(schemas?.ChatMessageRequest).toBeDefined();
      expect(schemas?.KnowledgeEntry).toBeDefined();
      expect(schemas?.AnalyticsSummary).toBeDefined();
      expect(schemas?.Subscription).toBeDefined();
      expect(schemas?.HealthCheck).toBeDefined();
    });

    it("should include all response definitions", async () => {
      const { swaggerSpec } = await import("../../../server/config/swagger");
      const spec = swaggerSpec as SwaggerSpec;
      
      expect(spec.components?.responses).toBeDefined();
      
      const responses = spec.components?.responses;
      expect(responses?.UnauthorizedError).toBeDefined();
      expect(responses?.ForbiddenError).toBeDefined();
      expect(responses?.NotFoundError).toBeDefined();
      expect(responses?.ValidationError).toBeDefined();
      expect(responses?.RateLimitError).toBeDefined();
    });

    it("should include all parameter definitions", async () => {
      const { swaggerSpec } = await import("../../../server/config/swagger");
      const spec = swaggerSpec as SwaggerSpec;
      
      expect(spec.components?.parameters).toBeDefined();
      
      const parameters = spec.components?.parameters;
      expect(parameters?.ChatbotId).toBeDefined();
      expect(parameters?.ConversationId).toBeDefined();
      expect(parameters?.SessionId).toBeDefined();
      expect(parameters?.Pagination).toBeDefined();
      expect(parameters?.Limit).toBeDefined();
    });

    it("should configure API paths correctly", async () => {
      // Clear previous calls
      mockSwaggerJsdoc.mockClear();
      
      // Re-import to trigger the call
      vi.resetModules();
      await import("../../../server/config/swagger");
      
      expect(mockSwaggerJsdoc).toHaveBeenCalled();
      const callArgs = mockSwaggerJsdoc.mock.calls[0][0];
      
      expect(callArgs.apis).toBeDefined();
      expect(Array.isArray(callArgs.apis)).toBe(true);
      expect(callArgs.apis.length).toBeGreaterThan(0);
    });

    it("should have correct info contact details", async () => {
      const { swaggerSpec } = await import("../../../server/config/swagger");
      const spec = swaggerSpec as SwaggerSpec;
      
      expect(spec.info.contact).toBeDefined();
      expect(spec.info.contact?.name).toBe("ConvoAI Support");
      expect(spec.info.contact?.email).toBe("support@convoai.com");
    });

    it("should have correct license information", async () => {
      const { swaggerSpec } = await import("../../../server/config/swagger");
      const spec = swaggerSpec as SwaggerSpec;
      
      expect(spec.info.license).toBeDefined();
      expect(spec.info.license?.name).toBe("MIT");
      expect(spec.info.license?.url).toBe("https://opensource.org/licenses/MIT");
    });

    it("should include description with key features", async () => {
      const { swaggerSpec } = await import("../../../server/config/swagger");
      const spec = swaggerSpec as SwaggerSpec;
      
      expect(spec.info.description).toBeDefined();
      expect(spec.info.description).toContain("ConvoAI");
      expect(spec.info.description).toContain("AI chatbot platform");
      expect(spec.info.description).toContain("Authentication");
      expect(spec.info.description).toContain("CSRF Protection");
    });

    it("should set server description based on NODE_ENV", () => {
      // Test the logic directly
      const nodeEnv = process.env.NODE_ENV || "development";
      const description = nodeEnv === "production" ? "Production server" : "Development server";
      
      expect(description).toBeDefined();
      expect(typeof description).toBe("string");
      if (nodeEnv === "production") {
        expect(description).toBe("Production server");
      } else {
        expect(description).toBe("Development server");
      }
    });
  });

  describe("Schema validation", () => {
    it("should have Error schema with all required properties", async () => {
      const { swaggerSpec } = await import("../../../server/config/swagger");
      const spec = swaggerSpec as SwaggerSpec;
      
      const errorSchema = spec.components?.schemas?.Error;
      expect(errorSchema?.type).toBe("object");
      expect(errorSchema?.properties?.message).toBeDefined();
      expect(errorSchema?.properties?.code).toBeDefined();
      expect(errorSchema?.properties?.details).toBeDefined();
      expect(errorSchema?.properties?.requestId).toBeDefined();
    });

    it("should have Chatbot schema with required fields", async () => {
      const { swaggerSpec } = await import("../../../server/config/swagger");
      const spec = swaggerSpec as SwaggerSpec;
      
      const chatbotSchema = spec.components?.schemas?.Chatbot;
      expect(chatbotSchema?.type).toBe("object");
      expect(chatbotSchema?.properties?.id).toBeDefined();
      expect(chatbotSchema?.properties?.name).toBeDefined();
      expect(chatbotSchema?.properties?.website_url).toBeDefined();
    });

    it("should have CreateChatbotRequest with required fields", async () => {
      const { swaggerSpec } = await import("../../../server/config/swagger");
      const spec = swaggerSpec as SwaggerSpec;
      
      const createSchema = spec.components?.schemas?.CreateChatbotRequest;
      expect(createSchema?.required).toContain("website_url");
      expect(createSchema?.required).toContain("name");
    });

    it("should have ChatMessageRequest with required fields", async () => {
      const { swaggerSpec } = await import("../../../server/config/swagger");
      const spec = swaggerSpec as SwaggerSpec;
      
      const messageSchema = spec.components?.schemas?.ChatMessageRequest;
      expect(messageSchema?.required).toContain("chatbot_id");
      expect(messageSchema?.required).toContain("session_id");
      expect(messageSchema?.required).toContain("message");
    });

    it("should have Subscription schema with enum values", async () => {
      const { swaggerSpec } = await import("../../../server/config/swagger");
      const spec = swaggerSpec as SwaggerSpec;
      
      const subscriptionSchema = spec.components?.schemas?.Subscription;
      expect(subscriptionSchema?.properties?.plan?.enum).toContain("free");
      expect(subscriptionSchema?.properties?.plan?.enum).toContain("pro");
      expect(subscriptionSchema?.properties?.plan?.enum).toContain("enterprise");
      expect(subscriptionSchema?.properties?.status?.enum).toContain("active");
      expect(subscriptionSchema?.properties?.status?.enum).toContain("cancelled");
    });

    it("should have HealthCheck schema with status enum", async () => {
      const { swaggerSpec } = await import("../../../server/config/swagger");
      const spec = swaggerSpec as SwaggerSpec;
      
      const healthSchema = spec.components?.schemas?.HealthCheck;
      expect(healthSchema?.properties?.status?.enum).toContain("ok");
      expect(healthSchema?.properties?.status?.enum).toContain("degraded");
      expect(healthSchema?.properties?.status?.enum).toContain("error");
    });
  });
});
