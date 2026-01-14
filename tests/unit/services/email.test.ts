import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Resend - create mock function directly in class
vi.mock("resend", () => {
  const sendFn = vi.fn();
  
  return {
    Resend: class {
      emails = {
        send: sendFn,
      };
      constructor() {
        return this;
      }
    },
    __getMockSend: () => sendFn, // Export for test access
  };
});

vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import EmailService from "../../../server/services/email";
import logger from "../../../server/utils/logger";
import * as resendModule from "resend";

// Get the mock function from the mocked module
const getMockSend = () => {
  return (resendModule as any).__getMockSend();
};

describe("Email Service", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("sendEmail", () => {
    it("should send email successfully", async () => {
      process.env.RESEND_API_KEY = "test-key";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      const result = await EmailService.sendEmail({
        to: "test@example.com",
        subject: "Test Subject",
        html: "<p>Test content</p>",
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("email-123");
      expect(logger.info).toHaveBeenCalled();
    });

    it("should handle array of recipients", async () => {
      process.env.RESEND_API_KEY = "test-key";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      const result = await EmailService.sendEmail({
        to: ["test1@example.com", "test2@example.com"],
        subject: "Test Subject",
        html: "<p>Test content</p>",
      });

      expect(result.success).toBe(true);
      expect(getMockSend()).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["test1@example.com", "test2@example.com"],
        })
      );
    });

    it("should use custom from address when provided", async () => {
      process.env.RESEND_API_KEY = "test-key";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      await EmailService.sendEmail({
        to: "test@example.com",
        subject: "Test",
        html: "<p>Test</p>",
        from: "custom@example.com",
      });

      expect(getMockSend()).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "custom@example.com",
        })
      );
    });

    it("should use default from address when not provided", async () => {
      process.env.RESEND_API_KEY = "test-key";
      process.env.EMAIL_FROM = "default@example.com";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      await EmailService.sendEmail({
        to: "test@example.com",
        subject: "Test",
        html: "<p>Test</p>",
      });

      // Just verify it was called - the default is set at module load time
      expect(getMockSend()).toHaveBeenCalled();
      const callArgs = getMockSend().mock.calls[0][0];
      expect(callArgs.from).toBeDefined();
    });

    it("should return error when RESEND_API_KEY is not configured", async () => {
      delete process.env.RESEND_API_KEY;

      const result = await EmailService.sendEmail({
        to: "test@example.com",
        subject: "Test",
        html: "<p>Test</p>",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Email service not configured");
      expect(logger.warn).toHaveBeenCalled();
    });

    it("should handle Resend API errors", async () => {
      process.env.RESEND_API_KEY = "test-key";

      getMockSend().mockResolvedValue({
        data: null,
        error: { message: "API error", name: "ResendError" },
      });

      const result = await EmailService.sendEmail({
        to: "test@example.com",
        subject: "Test",
        html: "<p>Test</p>",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("API error");
      expect(logger.error).toHaveBeenCalled();
    });

    it("should handle unexpected errors", async () => {
      process.env.RESEND_API_KEY = "test-key";

      getMockSend().mockRejectedValue(
        new Error("Network error")
      );

      const result = await EmailService.sendEmail({
        to: "test@example.com",
        subject: "Test",
        html: "<p>Test</p>",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("sendWelcomeEmail", () => {
    it("should send welcome email", async () => {
      process.env.RESEND_API_KEY = "test-key";
      process.env.APP_URL = "https://app.example.com";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      await EmailService.sendWelcomeEmail("test@example.com", "John Doe");

      expect(getMockSend()).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["test@example.com"],
          subject: "Welcome to ConvoAI!",
        })
      );
      expect(getMockSend().mock.calls[0][0].html).toContain(
        "John Doe"
      );
    });
  });

  describe("sendSubscriptionConfirmation", () => {
    it("should send subscription confirmation email", async () => {
      process.env.RESEND_API_KEY = "test-key";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      await EmailService.sendSubscriptionConfirmation(
        "test@example.com",
        "Starter",
        "$49.00"
      );

      expect(getMockSend()).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["test@example.com"],
          subject: "Subscription Confirmed - Starter",
        })
      );
      expect(getMockSend().mock.calls[0][0].html).toContain(
        "Starter"
      );
      expect(getMockSend().mock.calls[0][0].html).toContain(
        "$49.00"
      );
    });
  });

  describe("sendDataExportEmail", () => {
    it("should send data export email", async () => {
      process.env.RESEND_API_KEY = "test-key";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      const expiresAt = new Date("2024-12-31T23:59:59Z");
      await EmailService.sendDataExportEmail(
        "test@example.com",
        "https://example.com/download",
        expiresAt
      );

      expect(getMockSend()).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["test@example.com"],
          subject: "Your Data Export is Ready - ConvoAI",
        })
      );
      const html = getMockSend().mock.calls[0][0].html;
      expect(html).toContain("https://example.com/download");
    });
  });

  describe("sendAccountDeletionConfirmation", () => {
    it("should send account deletion confirmation email", async () => {
      process.env.RESEND_API_KEY = "test-key";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      const deletionDate = new Date("2024-12-31T23:59:59Z");
      await EmailService.sendAccountDeletionConfirmation(
        "test@example.com",
        "John Doe",
        deletionDate
      );

      expect(getMockSend()).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["test@example.com"],
          subject: "Account Deletion Scheduled - ConvoAI",
        })
      );
      const html = getMockSend().mock.calls[0][0].html;
      expect(html).toContain("John Doe");
    });
  });

  describe("sendPasswordResetEmail", () => {
    it("should send password reset email", async () => {
      process.env.RESEND_API_KEY = "test-key";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      await EmailService.sendPasswordResetEmail(
        "test@example.com",
        "https://example.com/reset?token=abc123"
      );

      expect(getMockSend()).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["test@example.com"],
          subject: "Reset Your Password - ConvoAI",
        })
      );
      const html = getMockSend().mock.calls[0][0].html;
      expect(html).toContain("https://example.com/reset?token=abc123");
    });
  });

  describe("sendTrainingCompleteEmail", () => {
    it("should send training complete email", async () => {
      process.env.RESEND_API_KEY = "test-key";
      process.env.APP_URL = "https://app.example.com";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      await EmailService.sendTrainingCompleteEmail(
        "test@example.com",
        "My Chatbot",
        1500
      );

      expect(getMockSend()).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["test@example.com"],
          subject: "Training Complete - My Chatbot",
        })
      );
      const html = getMockSend().mock.calls[0][0].html;
      expect(html).toContain("My Chatbot");
      expect(html).toContain("1,500");
    });
  });

  describe("sendUsageLimitWarning", () => {
    it("should send usage limit warning email", async () => {
      process.env.RESEND_API_KEY = "test-key";
      process.env.APP_URL = "https://app.example.com";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      await EmailService.sendUsageLimitWarning(
        "test@example.com",
        800,
        1000,
        "messages"
      );

      expect(getMockSend()).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["test@example.com"],
          subject: "Usage Limit Warning - messages",
        })
      );
      const html = getMockSend().mock.calls[0][0].html;
      expect(html).toContain("80% Used");
      expect(html).toContain("800");
      expect(html).toContain("1,000");
    });

    it("should calculate percentage correctly", async () => {
      process.env.RESEND_API_KEY = "test-key";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      await EmailService.sendUsageLimitWarning(
        "test@example.com",
        50,
        100,
        "chatbots"
      );

      const html = getMockSend().mock.calls[0][0].html;
      expect(html).toContain("50% Used");
    });
  });

  describe("sendAccountDeletionCompleted", () => {
    it("should send account deletion completed email", async () => {
      process.env.RESEND_API_KEY = "test-key";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      await EmailService.sendAccountDeletionCompleted("test@example.com");

      expect(getMockSend()).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["test@example.com"],
          subject: "Account Deletion Completed - ConvoAI",
        })
      );
      const html = getMockSend().mock.calls[0][0].html;
      expect(html).toContain("Account Deletion Completed");
      expect(html).toContain("permanently deleted");
      expect(html).toContain("GDPR Right to Erasure");
    });
  });

  describe("sendSubscriptionCanceled", () => {
    it("should send subscription canceled email", async () => {
      process.env.RESEND_API_KEY = "test-key";
      process.env.APP_URL = "https://app.example.com";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      const cancelDate = new Date("2024-12-31");
      await EmailService.sendSubscriptionCanceled("test@example.com", "Starter", cancelDate);

      expect(getMockSend()).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["test@example.com"],
          subject: "Subscription Canceled - Starter",
        })
      );
      const html = getMockSend().mock.calls[0][0].html;
      expect(html).toContain("Starter");
      expect(html).toContain("canceled");
      expect(html).toContain("Free plan");
    });
  });

  describe("sendSubscriptionPastDue", () => {
    it("should send subscription past due email", async () => {
      process.env.RESEND_API_KEY = "test-key";
      process.env.APP_URL = "https://app.example.com";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      const dueDate = new Date("2024-12-31");
      await EmailService.sendSubscriptionPastDue("test@example.com", "Growth", dueDate);

      expect(getMockSend()).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["test@example.com"],
          subject: "Payment Past Due - Action Required",
        })
      );
      const html = getMockSend().mock.calls[0][0].html;
      expect(html).toContain("Growth");
      expect(html).toContain("past due");
      expect(html).toContain("Action Required");
    });
  });

  describe("sendPaymentFailed", () => {
    it("should send payment failed email without retry date", async () => {
      process.env.RESEND_API_KEY = "test-key";
      process.env.APP_URL = "https://app.example.com";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      await EmailService.sendPaymentFailed("test@example.com", "Business", "$99.00");

      expect(getMockSend()).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["test@example.com"],
          subject: "Payment Failed - Business",
        })
      );
      const html = getMockSend().mock.calls[0][0].html;
      expect(html).toContain("Business");
      expect(html).toContain("$99.00");
      expect(html).toContain("Payment Failed");
    });

    it("should send payment failed email with retry date", async () => {
      process.env.RESEND_API_KEY = "test-key";
      process.env.APP_URL = "https://app.example.com";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      const retryDate = new Date("2024-12-31");
      await EmailService.sendPaymentFailed("test@example.com", "Business", "$99.00", retryDate);

      const html = getMockSend().mock.calls[0][0].html;
      expect(html).toContain("Next Retry");
    });
  });

  describe("sendAdminAlert", () => {
    it("should send admin alert email to single recipient", async () => {
      process.env.RESEND_API_KEY = "test-key";
      process.env.EMAIL_FROM_ALERTS = "alerts@example.com";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      await EmailService.sendAdminAlert(
        "admin@example.com",
        "Database Error",
        "Connection failed",
        { error: "Connection timeout" }
      );

      expect(getMockSend()).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["admin@example.com"],
          subject: "[CRITICAL] Database Error - Connection failed",
          from: "alerts@example.com",
        })
      );
      const html = getMockSend().mock.calls[0][0].html;
      expect(html).toContain("Database Error");
      expect(html).toContain("Connection failed");
      expect(html).toContain("Connection timeout");
    });

    it("should send admin alert email to multiple recipients", async () => {
      process.env.RESEND_API_KEY = "test-key";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      await EmailService.sendAdminAlert(
        ["admin1@example.com", "admin2@example.com"],
        "Redis Error",
        "Quota exceeded"
      );

      expect(getMockSend()).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["admin1@example.com", "admin2@example.com"],
          subject: "[CRITICAL] Redis Error - Quota exceeded",
        })
      );
    });

    it("should send admin alert without details", async () => {
      process.env.RESEND_API_KEY = "test-key";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      await EmailService.sendAdminAlert("admin@example.com", "System Alert", "Service down");

      const html = getMockSend().mock.calls[0][0].html;
      expect(html).not.toContain("Details:");
    });
  });

  describe("sendRedisQuotaExceeded", () => {
    it("should send Redis quota exceeded alert", async () => {
      process.env.RESEND_API_KEY = "test-key";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      await EmailService.sendRedisQuotaExceeded("admin@example.com");

      expect(getMockSend()).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["admin@example.com"],
          subject: expect.stringContaining("Redis Quota Exceeded"),
        })
      );
    });

    it("should send Redis quota exceeded alert to multiple recipients", async () => {
      process.env.RESEND_API_KEY = "test-key";

      getMockSend().mockResolvedValue({
        data: { id: "email-123" },
        error: null,
      });

      await EmailService.sendRedisQuotaExceeded(["admin1@example.com", "admin2@example.com"]);

      expect(getMockSend()).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ["admin1@example.com", "admin2@example.com"],
        })
      );
    });
  });
});

