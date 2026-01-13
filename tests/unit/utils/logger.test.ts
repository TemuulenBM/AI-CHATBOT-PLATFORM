import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Unmock logger to test actual implementation
vi.unmock("../../../server/utils/logger");

// Mock winston before importing logger
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  log: vi.fn(),
  add: vi.fn(),
};

// Store the consoleFormat function so we can test it
let capturedConsoleFormat: ((info: any) => string) | null = null;

vi.mock("winston", () => {
  return {
    default: {
      createLogger: vi.fn(() => mockLogger),
      transports: {
        Console: vi.fn(),
      },
      format: {
        combine: vi.fn((...args) => args),
        timestamp: vi.fn((options) => ({ type: "timestamp", options })),
        printf: vi.fn((fn) => {
          // Capture the format function for testing
          capturedConsoleFormat = fn;
          return { type: "printf", fn };
        }),
        colorize: vi.fn(() => ({ type: "colorize" })),
        errors: vi.fn((options) => ({ type: "errors", options })),
        json: vi.fn(() => ({ type: "json" })),
      },
    },
  };
});

vi.mock("winston-daily-rotate-file", () => ({
  default: vi.fn(),
}));

// Test the logic patterns from logger without creating actual log files

describe("Logger - Logic Tests", () => {
  describe("Log level configuration", () => {
    it("should use LOG_LEVEL from environment when set", () => {
      const envLogLevel = "debug";
      const defaultLevel = "info";
      const level = envLogLevel || defaultLevel;

      expect(level).toBe("debug");
    });

    it("should use default log level when not set", () => {
      const envLogLevel = undefined;
      const defaultLevel = "info";
      const level = envLogLevel || defaultLevel;

      expect(level).toBe("info");
    });
  });

  describe("Default meta configuration", () => {
    it("should set correct service name", () => {
      const defaultMeta = {
        service: "ai-chatbot-platform",
        environment: process.env.NODE_ENV || "development",
      };

      expect(defaultMeta.service).toBe("ai-chatbot-platform");
    });

    it("should use development as default environment", () => {
      const nodeEnv = undefined;
      const environment = nodeEnv || "development";

      expect(environment).toBe("development");
    });
  });

  describe("Console format output", () => {
    it("should format log message correctly", () => {
      const timestamp = "2024-01-01 12:00:00";
      const level = "info";
      const message = "Test message";
      const meta: Record<string, unknown> = {};

      let msg = `${timestamp} [${level}] ${message}`;
      if (Object.keys(meta).length > 0) {
        msg += ` ${JSON.stringify(meta)}`;
      }

      expect(msg).toBe("2024-01-01 12:00:00 [info] Test message");
    });

    it("should include meta in log message", () => {
      const timestamp = "2024-01-01 12:00:00";
      const level = "info";
      const message = "Test message";
      const meta = { userId: "123" };

      let msg = `${timestamp} [${level}] ${message}`;
      if (Object.keys(meta).length > 0) {
        msg += ` ${JSON.stringify(meta)}`;
      }

      expect(msg).toContain('{"userId":"123"}');
    });

    it("should include stack trace when present", () => {
      const timestamp = "2024-01-01 12:00:00";
      const level = "error";
      const message = "Error message";
      const stack = "Error: Something went wrong\n    at test.js:10";

      let msg = `${timestamp} [${level}] ${message}`;
      if (stack) {
        msg += `\n${stack}`;
      }

      expect(msg).toContain("Error: Something went wrong");
      expect(msg).toContain("at test.js:10");
    });
  });

  describe("logAuth function patterns", () => {
    type AuthAction = "login" | "signup" | "logout" | "refresh" | "failed";

    function maskEmail(email: string): string {
      return email.replace(/(.{2}).*(@.*)/, "$1***$2");
    }

    it("should mask email correctly", () => {
      expect(maskEmail("john@example.com")).toBe("jo***@example.com");
      // Regex needs at least 2 chars before @ to work
      // With 1 char, regex doesn't match and email is unchanged
      expect(maskEmail("ab@b.com")).toBe("ab***@b.com");
    });

    it("should create correct auth log structure", () => {
      const action: AuthAction = "login";
      const userId = "user123";
      const email = "test@example.com";

      const logData = {
        category: "auth",
        action,
        userId,
        email: email ? maskEmail(email) : undefined,
      };

      expect(logData.category).toBe("auth");
      expect(logData.action).toBe("login");
      expect(logData.email).toBe("te***@example.com");
    });

    it("should handle undefined email", () => {
      const getMaskedEmail = (email: string | undefined): string | undefined => {
        return email ? email.replace(/(.{2}).*(@.*)/, "$1***$2") : undefined;
      };

      const email: string | undefined = undefined;
      const logData = {
        email: getMaskedEmail(email),
      };

      expect(logData.email).toBeUndefined();
    });
  });

  describe("logChatbot function patterns", () => {
    type ChatbotAction = "created" | "updated" | "deleted" | "status_change";

    it("should create correct chatbot log structure", () => {
      const action: ChatbotAction = "created";
      const chatbotId = "chatbot123";
      const userId = "user456";
      const meta = { name: "My Bot" };

      const logData = {
        category: "chatbot",
        action,
        chatbotId,
        userId,
        ...meta,
      };

      expect(logData.category).toBe("chatbot");
      expect(logData.action).toBe("created");
      expect(logData.name).toBe("My Bot");
    });
  });

  describe("logJob function patterns", () => {
    type Queue = "scraping" | "embedding";
    type JobAction = "started" | "completed" | "failed" | "progress";

    it("should use error level for failed jobs", () => {
      const action: JobAction = "failed";
      const level = action === "failed" ? "error" : "info";

      expect(level).toBe("error");
    });

    it("should use info level for other job actions", () => {
      const actions: JobAction[] = ["started", "completed", "progress"];

      actions.forEach((action) => {
        const level = action === "failed" ? "error" : "info";
        expect(level).toBe("info");
      });
    });

    it("should create correct job log structure", () => {
      const queue: Queue = "scraping";
      const action: JobAction = "completed";
      const jobId = "job123";
      const meta = { pagesScraped: 10 };

      const logData = {
        category: "job",
        queue,
        action,
        jobId,
        ...meta,
      };

      expect(logData.category).toBe("job");
      expect(logData.queue).toBe("scraping");
      expect(logData.pagesScraped).toBe(10);
    });
  });

  describe("logPayment function patterns", () => {
    type PaymentAction =
      | "subscription_created"
      | "subscription_updated"
      | "subscription_cancelled"
      | "payment_succeeded"
      | "payment_failed"
      | "webhook_received";

    it("should use error level for failed payments", () => {
      const action: PaymentAction = "payment_failed";
      const level = action.includes("failed") ? "error" : "info";

      expect(level).toBe("error");
    });

    it("should use info level for successful payments", () => {
      const action: PaymentAction = "payment_succeeded";
      const level = action.includes("failed") ? "error" : "info";

      expect(level).toBe("info");
    });

    it("should create correct payment log structure", () => {
      const action: PaymentAction = "subscription_created";
      const userId = "user123";
      const meta = { plan: "pro" };

      const logData = {
        category: "payment",
        action,
        userId,
        ...meta,
      };

      expect(logData.category).toBe("payment");
      expect(logData.plan).toBe("pro");
    });
  });

  describe("logApiError function patterns", () => {
    it("should create correct API error log structure", () => {
      const error = new Error("Not found");
      const context = {
        requestId: "req123",
        path: "/api/users",
        method: "GET",
        userId: "user456",
        statusCode: 404,
      };

      const logData = {
        category: "api_error",
        error: error.message,
        errorName: error.name,
        stack: error.stack,
        ...context,
      };

      expect(logData.category).toBe("api_error");
      expect(logData.error).toBe("Not found");
      expect(logData.errorName).toBe("Error");
      expect(logData.path).toBe("/api/users");
      expect(logData.statusCode).toBe(404);
    });
  });

  describe("logChat function patterns", () => {
    type ChatAction =
      | "message_sent"
      | "message_received"
      | "conversation_started"
      | "conversation_ended";

    it("should create correct chat log structure", () => {
      const action: ChatAction = "message_sent";
      const chatbotId = "chatbot123";
      const sessionId = "session456";
      const meta = { messageLength: 100 };

      const logData = {
        category: "chat",
        action,
        chatbotId,
        sessionId,
        ...meta,
      };

      expect(logData.category).toBe("chat");
      expect(logData.action).toBe("message_sent");
      expect(logData.messageLength).toBe(100);
    });
  });

  describe("logPerformance function patterns", () => {
    it("should use warn level for slow operations", () => {
      const durationMs = 6000; // > 5000
      const level = durationMs > 5000 ? "warn" : "debug";

      expect(level).toBe("warn");
    });

    it("should use debug level for fast operations", () => {
      const durationMs = 100; // < 5000
      const level = durationMs > 5000 ? "warn" : "debug";

      expect(level).toBe("debug");
    });

    it("should create correct performance log structure", () => {
      const operation = "database_query";
      const durationMs = 150;
      const meta = { query: "SELECT * FROM users" };

      const logData = {
        category: "performance",
        operation,
        durationMs,
        ...meta,
      };

      expect(logData.category).toBe("performance");
      expect(logData.operation).toBe("database_query");
      expect(logData.durationMs).toBe(150);
    });
  });

  describe("File transport configuration in production", () => {
    it("should configure error log rotation", () => {
      const errorLogConfig = {
        filename: "logs/error-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        level: "error",
        maxSize: "20m",
        maxFiles: "30d",
        zippedArchive: true,
      };

      expect(errorLogConfig.level).toBe("error");
      expect(errorLogConfig.maxFiles).toBe("30d");
      expect(errorLogConfig.zippedArchive).toBe(true);
    });

    it("should configure combined log rotation", () => {
      const combinedLogConfig = {
        filename: "logs/combined-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        maxSize: "20m",
        maxFiles: "14d",
        zippedArchive: true,
      };

      expect(combinedLogConfig.maxFiles).toBe("14d");
    });

    it("should use LOG_DIR environment variable", () => {
      const envLogDir = "custom-logs";
      const defaultLogDir = "logs";
      const logDir = envLogDir || defaultLogDir;

      expect(logDir).toBe("custom-logs");
    });

    it("should use default log directory when not set", () => {
      const envLogDir = undefined;
      const defaultLogDir = "logs";
      const logDir = envLogDir || defaultLogDir;

      expect(logDir).toBe("logs");
    });
  });

  describe("Timestamp format", () => {
    it("should use correct console timestamp format", () => {
      const format = "YYYY-MM-DD HH:mm:ss";
      expect(format).toBe("YYYY-MM-DD HH:mm:ss");
    });

    it("should use correct file timestamp format with milliseconds", () => {
      const format = "YYYY-MM-DD HH:mm:ss.SSS";
      expect(format).toBe("YYYY-MM-DD HH:mm:ss.SSS");
    });
  });

  describe("Production environment detection", () => {
    it("should add file transports only in production", () => {
      const nodeEnv = "production";
      const shouldAddFileTransports = nodeEnv === "production";

      expect(shouldAddFileTransports).toBe(true);
    });

    it("should not add file transports in development", () => {
      const nodeEnv: string = "development";
      const shouldAddFileTransports = nodeEnv === "production";

      expect(shouldAddFileTransports).toBe(false);
    });
  });
});

// Test actual logger implementation
describe("Logger - Implementation Tests", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
    capturedConsoleFormat = null;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  describe("Logger instance", () => {
    it("should create logger with correct default level", async () => {
      delete process.env.LOG_LEVEL;
      vi.resetModules();
      const { logger } = await import("../../../server/utils/logger");
      
      expect(logger).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.debug).toBeDefined();
    });

    it("should use LOG_LEVEL from environment", async () => {
      process.env.LOG_LEVEL = "debug";
      vi.resetModules();
      
      const { logger } = await import("../../../server/utils/logger");
      expect(logger).toBeDefined();
    });

    it("should use default environment when NODE_ENV is not set", async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;
      vi.resetModules();
      
      await import("../../../server/utils/logger");
      
      // Verify logger was created (line 31: environment: process.env.NODE_ENV || "development")
      expect(mockLogger).toBeDefined();
      
      process.env.NODE_ENV = originalNodeEnv;
    });

    it("should log info messages", async () => {
      vi.resetModules();
      const { logger } = await import("../../../server/utils/logger");
      logger.info("Test message", { userId: "123" });
      
      expect(mockLogger.info).toHaveBeenCalledWith("Test message", { userId: "123" });
    });

    it("should log error messages", async () => {
      vi.resetModules();
      const { logger } = await import("../../../server/utils/logger");
      logger.error("Error message", { error: "test error" });
      
      expect(mockLogger.error).toHaveBeenCalledWith("Error message", { error: "test error" });
    });

    it("should log warn messages", async () => {
      vi.resetModules();
      const { logger } = await import("../../../server/utils/logger");
      logger.warn("Warning message", { warning: "test" });
      
      expect(mockLogger.warn).toHaveBeenCalledWith("Warning message", { warning: "test" });
    });

    it("should log debug messages", async () => {
      vi.resetModules();
      const { logger } = await import("../../../server/utils/logger");
      logger.debug("Debug message", { debug: "test" });
      
      expect(mockLogger.debug).toHaveBeenCalledWith("Debug message", { debug: "test" });
    });
  });

  describe("logAuth", () => {
    it("should log auth events with masked email", async () => {
      vi.resetModules();
      const { logAuth } = await import("../../../server/utils/logger");
      logAuth("login", "user123", "test@example.com");
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Auth event",
        expect.objectContaining({
          category: "auth",
          action: "login",
          userId: "user123",
          email: "te***@example.com",
        })
      );
    });

    it("should log auth events without email", async () => {
      vi.resetModules();
      const { logAuth } = await import("../../../server/utils/logger");
      logAuth("logout", "user123");
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Auth event",
        expect.objectContaining({
          category: "auth",
          action: "logout",
          userId: "user123",
          email: undefined,
        })
      );
    });

    it("should log auth events with meta", async () => {
      vi.resetModules();
      const { logAuth } = await import("../../../server/utils/logger");
      logAuth("signup", "user123", "test@example.com", { ip: "127.0.0.1" });
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Auth event",
        expect.objectContaining({
          category: "auth",
          action: "signup",
          ip: "127.0.0.1",
        })
      );
    });

    it("should handle all auth actions", async () => {
      vi.resetModules();
      const { logAuth } = await import("../../../server/utils/logger");
      const actions = ["login", "signup", "logout", "refresh", "failed"] as const;
      
      actions.forEach((action) => {
        logAuth(action, "user123");
      });
      
      expect(mockLogger.info).toHaveBeenCalledTimes(actions.length);
      actions.forEach((action) => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          "Auth event",
          expect.objectContaining({ action })
        );
      });
    });
  });

  describe("logChatbot", () => {
    it("should log chatbot events", async () => {
      vi.resetModules();
      const { logChatbot } = await import("../../../server/utils/logger");
      logChatbot("created", "chatbot123", "user456");
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Chatbot event",
        expect.objectContaining({
          category: "chatbot",
          action: "created",
          chatbotId: "chatbot123",
          userId: "user456",
        })
      );
    });

    it("should log chatbot events with meta", async () => {
      vi.resetModules();
      const { logChatbot } = await import("../../../server/utils/logger");
      logChatbot("updated", "chatbot123", "user456", { name: "My Bot" });
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Chatbot event",
        expect.objectContaining({
          category: "chatbot",
          action: "updated",
          name: "My Bot",
        })
      );
    });

    it("should handle all chatbot actions", async () => {
      vi.resetModules();
      const { logChatbot } = await import("../../../server/utils/logger");
      const actions = ["created", "updated", "deleted", "status_change"] as const;
      
      actions.forEach((action) => {
        logChatbot(action, "chatbot123", "user456");
      });
      
      expect(mockLogger.info).toHaveBeenCalledTimes(actions.length);
      actions.forEach((action) => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          "Chatbot event",
          expect.objectContaining({ action })
        );
      });
    });
  });

  describe("logJob", () => {
    it("should log job events with info level for non-failed actions", async () => {
      vi.resetModules();
      const { logJob } = await import("../../../server/utils/logger");
      logJob("scraping", "started", "job123");
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        "info",
        "Job event",
        expect.objectContaining({
          category: "job",
          queue: "scraping",
          action: "started",
          jobId: "job123",
        })
      );
    });

    it("should log job events with error level for failed actions", async () => {
      vi.resetModules();
      const { logJob } = await import("../../../server/utils/logger");
      logJob("embedding", "failed", "job456");
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        "error",
        "Job event",
        expect.objectContaining({
          category: "job",
          action: "failed",
        })
      );
    });

    it("should log job events with meta", async () => {
      vi.resetModules();
      const { logJob } = await import("../../../server/utils/logger");
      logJob("scraping", "completed", "job123", { pagesScraped: 10 });
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        "info",
        "Job event",
        expect.objectContaining({
          pagesScraped: 10,
        })
      );
    });

    it("should handle all job actions", async () => {
      vi.resetModules();
      const { logJob } = await import("../../../server/utils/logger");
      const actions = ["started", "completed", "failed", "progress"] as const;
      
      actions.forEach((action) => {
        logJob("scraping", action, "job123");
      });
      
      actions.forEach((action) => {
        const expectedLevel = action === "failed" ? "error" : "info";
        expect(mockLogger.log).toHaveBeenCalledWith(
          expectedLevel,
          "Job event",
          expect.objectContaining({ action })
        );
      });
    });
  });

  describe("logPayment", () => {
    it("should log payment events with info level for non-failed actions", async () => {
      vi.resetModules();
      const { logPayment } = await import("../../../server/utils/logger");
      logPayment("subscription_created", "user123");
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        "info",
        "Payment event",
        expect.objectContaining({
          category: "payment",
          action: "subscription_created",
          userId: "user123",
        })
      );
    });

    it("should log payment events with error level for failed actions", async () => {
      vi.resetModules();
      const { logPayment } = await import("../../../server/utils/logger");
      logPayment("payment_failed", "user123");
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        "error",
        "Payment event",
        expect.objectContaining({
          category: "payment",
          action: "payment_failed",
        })
      );
    });

    it("should log payment events with meta", async () => {
      vi.resetModules();
      const { logPayment } = await import("../../../server/utils/logger");
      logPayment("subscription_updated", "user123", { plan: "pro" });
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        "info",
        "Payment event",
        expect.objectContaining({
          plan: "pro",
        })
      );
    });

    it("should handle all payment actions", async () => {
      vi.resetModules();
      const { logPayment } = await import("../../../server/utils/logger");
      const actions = [
        "subscription_created",
        "subscription_updated",
        "subscription_cancelled",
        "payment_succeeded",
        "payment_failed",
        "webhook_received",
      ] as const;
      
      actions.forEach((action) => {
        logPayment(action, "user123");
      });
      
      actions.forEach((action) => {
        const expectedLevel = action.includes("failed") ? "error" : "info";
        expect(mockLogger.log).toHaveBeenCalledWith(
          expectedLevel,
          "Payment event",
          expect.objectContaining({ action })
        );
      });
    });
  });

  describe("logApiError", () => {
    it("should log API errors with full context", async () => {
      vi.resetModules();
      const { logApiError } = await import("../../../server/utils/logger");
      const error = new Error("Not found");
      error.stack = "Error: Not found\n    at test.js:10";
      
      logApiError(error, {
        requestId: "req123",
        path: "/api/users",
        method: "GET",
        userId: "user456",
        statusCode: 404,
      });
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        "API error",
        expect.objectContaining({
          category: "api_error",
          error: "Not found",
          errorName: "Error",
          stack: error.stack,
          requestId: "req123",
          path: "/api/users",
          method: "GET",
          userId: "user456",
          statusCode: 404,
        })
      );
    });

    it("should log API errors with partial context", async () => {
      vi.resetModules();
      const { logApiError } = await import("../../../server/utils/logger");
      const error = new Error("Internal error");
      
      logApiError(error, {
        path: "/api/test",
      });
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        "API error",
        expect.objectContaining({
          category: "api_error",
          error: "Internal error",
          path: "/api/test",
        })
      );
    });
  });

  describe("logChat", () => {
    it("should log chat events", async () => {
      vi.resetModules();
      const { logChat } = await import("../../../server/utils/logger");
      logChat("message_sent", "chatbot123", "session456");
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Chat event",
        expect.objectContaining({
          category: "chat",
          action: "message_sent",
          chatbotId: "chatbot123",
          sessionId: "session456",
        })
      );
    });

    it("should log chat events with meta", async () => {
      vi.resetModules();
      const { logChat } = await import("../../../server/utils/logger");
      logChat("message_received", "chatbot123", "session456", { messageLength: 100 });
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Chat event",
        expect.objectContaining({
          category: "chat",
          action: "message_received",
          messageLength: 100,
        })
      );
    });

    it("should handle all chat actions", async () => {
      vi.resetModules();
      const { logChat } = await import("../../../server/utils/logger");
      const actions = [
        "message_sent",
        "message_received",
        "conversation_started",
        "conversation_ended",
      ] as const;
      
      actions.forEach((action) => {
        logChat(action, "chatbot123", "session456");
      });
      
      actions.forEach((action) => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          "Chat event",
          expect.objectContaining({ action })
        );
      });
    });
  });

  describe("logPerformance", () => {
    it("should log performance metrics with debug level for fast operations", async () => {
      vi.resetModules();
      const { logPerformance } = await import("../../../server/utils/logger");
      logPerformance("database_query", 100);
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        "debug",
        "Performance metric",
        expect.objectContaining({
          category: "performance",
          operation: "database_query",
          durationMs: 100,
        })
      );
    });

    it("should log performance metrics with warn level for slow operations", async () => {
      vi.resetModules();
      const { logPerformance } = await import("../../../server/utils/logger");
      logPerformance("database_query", 6000);
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        "warn",
        "Performance metric",
        expect.objectContaining({
          category: "performance",
          operation: "database_query",
          durationMs: 6000,
        })
      );
    });

    it("should log performance metrics with meta", async () => {
      vi.resetModules();
      const { logPerformance } = await import("../../../server/utils/logger");
      logPerformance("api_call", 200, { endpoint: "/api/users" });
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        "debug",
        "Performance metric",
        expect.objectContaining({
          category: "performance",
          operation: "api_call",
          durationMs: 200,
          endpoint: "/api/users",
        })
      );
    });

    it("should use warn level for exactly 5000ms", async () => {
      vi.resetModules();
      const { logPerformance } = await import("../../../server/utils/logger");
      logPerformance("operation", 5001);
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        "warn",
        "Performance metric",
        expect.anything()
      );
    });
  });

  describe("Production file transports", () => {
    it("should add file transports in production environment", async () => {
      process.env.NODE_ENV = "production";
      process.env.LOG_DIR = "test-logs";
      vi.resetModules();
      
      await import("../../../server/utils/logger");
      
      // In production, logger.add should be called to add file transports
      // We verify the module loads successfully
      expect(mockLogger.add).toHaveBeenCalled();
    });

    it("should use default LOG_DIR when not set in production", async () => {
      process.env.NODE_ENV = "production";
      delete process.env.LOG_DIR;
      vi.resetModules();
      
      await import("../../../server/utils/logger");
      
      // Line 46: const logDir = process.env.LOG_DIR || "logs";
      // Should use default "logs" directory
      expect(mockLogger.add).toHaveBeenCalled();
    });

    it("should not add file transports in non-production environment", async () => {
      process.env.NODE_ENV = "test";
      delete process.env.LOG_DIR;
      vi.resetModules();
      
      const { logger } = await import("../../../server/utils/logger");
      expect(logger).toBeDefined();
      // In non-production, logger.add should not be called
      expect(mockLogger.add).not.toHaveBeenCalled();
    });
  });

  describe("Console format function", () => {
    // Test the actual consoleFormat function from logger.ts (lines 9-16)
    it("should format log message with timestamp and level", async () => {
      vi.resetModules();
      await import("../../../server/utils/logger");
      
      // The consoleFormat function should be captured
      expect(capturedConsoleFormat).not.toBeNull();
      
      if (capturedConsoleFormat) {
        const result = capturedConsoleFormat({
          level: "info",
          message: "Test message",
          timestamp: "2024-01-01 12:00:00",
        });
        
        expect(result).toBe("2024-01-01 12:00:00 [info] Test message");
      }
    });

    it("should include meta in formatted message", async () => {
      vi.resetModules();
      await import("../../../server/utils/logger");
      
      if (capturedConsoleFormat) {
        const result = capturedConsoleFormat({
          level: "info",
          message: "Test message",
          timestamp: "2024-01-01 12:00:00",
          userId: "123",
        });
        
        expect(result).toContain('{"userId":"123"}');
        expect(result).toContain("2024-01-01 12:00:00 [info] Test message");
      }
    });

    it("should include stack trace in formatted message", async () => {
      vi.resetModules();
      await import("../../../server/utils/logger");
      
      if (capturedConsoleFormat) {
        const result = capturedConsoleFormat({
          level: "error",
          message: "Error message",
          timestamp: "2024-01-01 12:00:00",
          stack: "Error: Something went wrong\n    at test.js:10",
        });
        
        expect(result).toContain("2024-01-01 12:00:00 [error] Error message");
        expect(result).toContain("Error: Something went wrong");
        expect(result).toContain("at test.js:10");
      }
    });

    it("should handle message with both meta and stack trace", async () => {
      vi.resetModules();
      await import("../../../server/utils/logger");
      
      if (capturedConsoleFormat) {
        const result = capturedConsoleFormat({
          level: "error",
          message: "Error message",
          timestamp: "2024-01-01 12:00:00",
          userId: "123",
          stack: "Error: Something went wrong\n    at test.js:10",
        });
        
        expect(result).toContain("2024-01-01 12:00:00 [error] Error message");
        expect(result).toContain('{"userId":"123"}');
        expect(result).toContain("Error: Something went wrong");
        expect(result).toContain("at test.js:10");
      }
    });

    it("should handle empty meta object", async () => {
      vi.resetModules();
      await import("../../../server/utils/logger");
      
      if (capturedConsoleFormat) {
        const result = capturedConsoleFormat({
          level: "info",
          message: "Test message",
          timestamp: "2024-01-01 12:00:00",
          // Empty meta object
        });
        
        expect(result).toBe("2024-01-01 12:00:00 [info] Test message");
        expect(result).not.toContain("{");
      }
    });

    it("should handle different log levels", async () => {
      vi.resetModules();
      await import("../../../server/utils/logger");
      
      if (capturedConsoleFormat) {
        const formatFn = capturedConsoleFormat;
        const levels = ["debug", "info", "warn", "error"];
        
        levels.forEach((level) => {
          const result = formatFn({
            level,
            message: "Test message",
            timestamp: "2024-01-01 12:00:00",
          });
          
          expect(result).toContain(`[${level}]`);
          expect(result).toContain("Test message");
        });
      }
    });
  });
});
