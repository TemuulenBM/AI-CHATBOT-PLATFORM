import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";

// Mock dependencies before importing
const mockVerify = vi.fn();

vi.mock("resend", () => {
  const mockEmails = {
    send: vi.fn().mockResolvedValue({ data: { id: "test-email-id" }, error: null }),
  };

  return {
    Resend: class {
      emails = mockEmails;
      constructor() {
        return this;
      }
    },
  };
});

vi.mock("svix", () => {
  return {
    Webhook: class {
      verify = mockVerify;
      constructor() {
        return this;
      }
    },
  };
});

vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { handleClerkWebhook } from "../../../server/middleware/clerkWebhook";
import { supabaseAdmin } from "../../../server/utils/supabase";
import logger from "../../../server/utils/logger";

describe("Clerk Webhook Handler - Direct Import", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLERK_WEBHOOK_SECRET = "test-webhook-secret";

    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    mockReq = {
      headers: {
        "svix-id": "msg_test123",
        "svix-timestamp": "1234567890",
        "svix-signature": "v1,test_signature",
      },
      body: {},
    };

    mockRes = {
      status: statusMock,
      json: jsonMock,
    };

    mockNext = vi.fn();
  });

  describe("webhook secret validation", () => {
    it("should return 500 when webhook secret is not configured", async () => {
      delete process.env.CLERK_WEBHOOK_SECRET;

      await handleClerkWebhook(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "Webhook secret not configured",
      });
      expect(logger.error).toHaveBeenCalledWith(
        "CLERK_WEBHOOK_SECRET is not configured"
      );
    });
  });

  describe("Svix header validation", () => {
    it("should return 400 when svix-id is missing", async () => {
      delete mockReq.headers!["svix-id"];

      await handleClerkWebhook(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "Missing webhook headers",
      });
    });

    it("should return 400 when svix-timestamp is missing", async () => {
      delete mockReq.headers!["svix-timestamp"];

      await handleClerkWebhook(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "Missing webhook headers",
      });
    });

    it("should return 400 when svix-signature is missing", async () => {
      delete mockReq.headers!["svix-signature"];

      await handleClerkWebhook(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "Missing webhook headers",
      });
    });
  });

  describe("signature verification", () => {
    it("should return 400 when signature verification fails", async () => {
      mockVerify.mockImplementationOnce(() => {
        throw new Error("Invalid signature");
      });

      await handleClerkWebhook(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "Invalid webhook signature",
      });
    });
  });

  describe("user.created event", () => {
    it("should create user with email in Supabase", async () => {
      mockVerify.mockReturnValueOnce({
        type: "user.created",
        data: {
          id: "user_test123",
          email_addresses: [
            { id: "email_1", email_address: "test@example.com" },
          ],
          primary_email_address_id: "email_1",
        },
      });

      const insertMock = vi.fn().mockResolvedValue({ error: null });
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: insertMock,
      });

      await handleClerkWebhook(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(supabaseAdmin.from).toHaveBeenCalledWith("users");
      expect(insertMock).toHaveBeenCalledWith({
        id: "user_test123",
        email: "test@example.com",
        password_hash: null,
        is_admin: false,
      });
      expect(statusMock).toHaveBeenCalledWith(200);
    });

    it("should handle user already exists error", async () => {
      mockVerify.mockReturnValueOnce({
        type: "user.created",
        data: {
          id: "user_test123",
          email_addresses: [
            { id: "email_1", email_address: "test@example.com" },
          ],
          primary_email_address_id: "email_1",
        },
      });

      const updateMock = vi.fn().mockReturnThis();
      const eqMock = vi.fn().mockResolvedValue({ error: null });
      let insertCallCount = 0;

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(
        (table: string) => {
          if (table === "users" && insertCallCount === 0) {
            insertCallCount++;
            return {
              insert: vi.fn().mockResolvedValue({
                error: { code: "23505", message: "Unique violation" },
              }),
              update: updateMock,
              eq: eqMock,
            };
          }
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
            update: updateMock,
            eq: eqMock,
          };
        }
      );

      await handleClerkWebhook(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(200);
    });

    it("should use fallback email when no primary email id", async () => {
      mockVerify.mockReturnValueOnce({
        type: "user.created",
        data: {
          id: "user_test123",
          email_addresses: [
            { id: "email_1", email_address: "first@example.com" },
            { id: "email_2", email_address: "second@example.com" },
          ],
        },
      });

      const insertMock = vi.fn().mockResolvedValue({ error: null });
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: insertMock,
      });

      await handleClerkWebhook(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "first@example.com",
        })
      );
    });

    it("should handle empty email addresses", async () => {
      mockVerify.mockReturnValueOnce({
        type: "user.created",
        data: {
          id: "user_test123",
          email_addresses: [],
        },
      });

      const insertMock = vi.fn().mockResolvedValue({ error: null });
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: insertMock,
      });

      await handleClerkWebhook(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "",
        })
      );
    });

    it("should create default subscription", async () => {
      mockVerify.mockReturnValueOnce({
        type: "user.created",
        data: {
          id: "user_test123",
          email_addresses: [
            { id: "email_1", email_address: "test@example.com" },
          ],
          primary_email_address_id: "email_1",
        },
      });

      const insertMock = vi.fn().mockResolvedValue({ error: null });
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: insertMock,
      });

      await handleClerkWebhook(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(supabaseAdmin.from).toHaveBeenCalledWith("subscriptions");
    });
  });

  describe("user.updated event", () => {
    it("should update user email in Supabase", async () => {
      mockVerify.mockReturnValueOnce({
        type: "user.updated",
        data: {
          id: "user_test123",
          email_addresses: [
            { id: "email_1", email_address: "newemail@example.com" },
          ],
          primary_email_address_id: "email_1",
        },
      });

      const updateMock = vi.fn().mockReturnThis();
      const eqMock = vi.fn().mockResolvedValue({ error: null });
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        update: updateMock,
        eq: eqMock,
      });

      await handleClerkWebhook(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(supabaseAdmin.from).toHaveBeenCalledWith("users");
      expect(updateMock).toHaveBeenCalledWith({
        email: "newemail@example.com",
        is_admin: false
      });
      expect(statusMock).toHaveBeenCalledWith(200);
    });

    it("should handle update error", async () => {
      mockVerify.mockReturnValueOnce({
        type: "user.updated",
        data: {
          id: "user_test123",
          email_addresses: [
            { id: "email_1", email_address: "test@example.com" },
          ],
          primary_email_address_id: "email_1",
        },
      });

      const updateMock = vi.fn().mockReturnThis();
      const eqMock = vi
        .fn()
        .mockResolvedValue({ error: { message: "Update failed" } });
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        update: updateMock,
        eq: eqMock,
      });

      await handleClerkWebhook(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to update user from webhook",
        expect.any(Object)
      );
      expect(statusMock).toHaveBeenCalledWith(200);
    });
  });

  describe("user.deleted event", () => {
    it("should delete user and related data", async () => {
      mockVerify.mockReturnValueOnce({
        type: "user.deleted",
        data: {
          id: "user_test123",
        },
      });

      const deleteMock = vi.fn().mockReturnThis();
      const eqMock = vi.fn().mockResolvedValue({ error: null });
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        delete: deleteMock,
        eq: eqMock,
      });

      await handleClerkWebhook(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(supabaseAdmin.from).toHaveBeenCalledWith("chatbots");
      expect(supabaseAdmin.from).toHaveBeenCalledWith("subscriptions");
      expect(supabaseAdmin.from).toHaveBeenCalledWith("users");
      expect(statusMock).toHaveBeenCalledWith(200);
    });

    it("should handle chatbot deletion error", async () => {
      mockVerify.mockReturnValueOnce({
        type: "user.deleted",
        data: {
          id: "user_test123",
        },
      });

      let callCount = 0;
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: { message: "Delete failed" } }),
          };
        }
        return {
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        };
      });

      await handleClerkWebhook(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to delete user chatbots from webhook",
        expect.any(Object)
      );
      expect(statusMock).toHaveBeenCalledWith(200);
    });
  });

  describe("unhandled event types", () => {
    it("should log debug for unhandled event types", async () => {
      mockVerify.mockReturnValueOnce({
        type: "session.created",
        data: {
          id: "session_test123",
        },
      });

      await handleClerkWebhook(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(logger.debug).toHaveBeenCalledWith("Unhandled webhook event type", {
        type: "session.created",
      });
      expect(statusMock).toHaveBeenCalledWith(200);
    });
  });

  describe("error handling", () => {
    it("should return 500 on unexpected error", async () => {
      mockVerify.mockReturnValueOnce({
        type: "user.created",
        data: {
          id: "user_test123",
          email_addresses: [
            { id: "email_1", email_address: "test@example.com" },
          ],
          primary_email_address_id: "email_1",
        },
      });

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: vi.fn().mockResolvedValue({
          error: { code: "OTHER", message: "Unexpected error" },
        }),
      });

      await handleClerkWebhook(
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "Webhook processing failed",
      });
    });
  });
});
