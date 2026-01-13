import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import type { KnowledgeBase } from "../../../shared/schema";

// Mock all modules before importing the controller
vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
  },
}));

vi.mock("../../../server/services/knowledge-base", () => ({
  knowledgeBaseService: {
    addKnowledgeEntry: vi.fn(),
    listKnowledgeEntries: vi.fn(),
    getKnowledgeEntry: vi.fn(),
    updateKnowledgeEntry: vi.fn(),
    deleteKnowledgeEntry: vi.fn(),
    bulkImport: vi.fn(),
    getStatistics: vi.fn(),
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

import {
  addKnowledgeEntry,
  listKnowledgeEntries,
  getKnowledgeEntry,
  updateKnowledgeEntry,
  deleteKnowledgeEntry,
  bulkImportKnowledge,
  getKnowledgeStats,
} from "../../../server/controllers/knowledge-base";
import { supabaseAdmin } from "../../../server/utils/supabase";
import { knowledgeBaseService } from "../../../server/services/knowledge-base";
import { AuthorizationError, NotFoundError, ValidationError } from "../../../server/utils/errors";

// Mock request factory
function createMockRequest(overrides: Partial<Request> = {}): Request & { user?: { userId: string; email: string } } {
  return {
    body: {},
    params: {},
    query: {},
    user: { userId: "user123", email: "user@example.com" },
    ...overrides,
  } as Request & { user?: { userId: string; email: string } };
}

// Mock response factory
function createMockResponse(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe("Knowledge Base Controller", () => {
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNext = vi.fn();
  });

  describe("addKnowledgeEntry", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await addKnowledgeEntry(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should throw NotFoundError when chatbot does not exist", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        body: { question: "Q", answer: "A" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      await addKnowledgeEntry(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it("should throw AuthorizationError when user does not own chatbot", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        body: { question: "Q", answer: "A" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "other-user" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      await addKnowledgeEntry(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should throw ValidationError when question is missing", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        body: { answer: "A" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      await addKnowledgeEntry(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
    });

    it("should add knowledge entry successfully", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        body: { question: "Q", answer: "A", category: "general", priority: 5 },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.addKnowledgeEntry).mockResolvedValue({
        id: "entry123",
        chatbot_id: "chatbot123",
        question: "Q",
        answer: "A",
        category: "general",
        priority: 5,
        enabled: true,
        embedding: [],
        created_at: new Date(),
        updated_at: new Date(),
      } as KnowledgeBase);

      await addKnowledgeEntry(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();
    });

    it("should handle service errors in addKnowledgeEntry", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        body: { question: "Q", answer: "A" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      const serviceError = new Error("Service error");
      vi.mocked(knowledgeBaseService.addKnowledgeEntry).mockRejectedValue(serviceError);

      await addKnowledgeEntry(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(serviceError);
    });

    it("should use default priority when not provided", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        body: { question: "Q", answer: "A" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.addKnowledgeEntry).mockResolvedValue({
        id: "entry123",
        chatbot_id: "chatbot123",
        question: "Q",
        answer: "A",
        category: null,
        priority: 0,
        enabled: true,
        embedding: [],
        created_at: new Date(),
        updated_at: new Date(),
      } as KnowledgeBase);

      await addKnowledgeEntry(req, res, mockNext);

      expect(knowledgeBaseService.addKnowledgeEntry).toHaveBeenCalledWith(
        "chatbot123",
        "Q",
        "A",
        undefined,
        0
      );
    });
  });

  describe("listKnowledgeEntries", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await listKnowledgeEntries(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should list entries with filters", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        query: { category: "faq", enabled: "true", search: "help", page: "1", limit: "20" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.listKnowledgeEntries).mockResolvedValue({
        entries: [],
        total: 0,
      });

      await listKnowledgeEntries(req, res, mockNext);

      expect(res.json).toHaveBeenCalled();
      expect(knowledgeBaseService.listKnowledgeEntries).toHaveBeenCalledWith(
        "chatbot123",
        { category: "faq", enabled: true, search: "help" },
        1,
        20
      );
    });

    it("should build filters object with category only", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        query: { category: "support" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.listKnowledgeEntries).mockResolvedValue({
        entries: [],
        total: 0,
      });

      await listKnowledgeEntries(req, res, mockNext);

      expect(knowledgeBaseService.listKnowledgeEntries).toHaveBeenCalledWith(
        "chatbot123",
        { category: "support" },
        1,
        50
      );
    });

    it("should handle missing query parameters", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        query: {},
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.listKnowledgeEntries).mockResolvedValue({
        entries: [],
        total: 0,
      });

      await listKnowledgeEntries(req, res, mockNext);

      expect(knowledgeBaseService.listKnowledgeEntries).toHaveBeenCalledWith(
        "chatbot123",
        {},
        1,
        50
      );
    });
  });

  describe("getKnowledgeEntry", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await getKnowledgeEntry(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should get a single entry", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "entry456" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.getKnowledgeEntry).mockResolvedValue({
        id: "entry456",
        chatbot_id: "chatbot123",
        question: "Q",
        answer: "A",
        category: null,
        priority: 0,
        enabled: true,
        embedding: [],
        created_at: new Date(),
        updated_at: new Date(),
      } as KnowledgeBase);

      await getKnowledgeEntry(req, res, mockNext);

      expect(res.json).toHaveBeenCalled();
    });

    it("should throw NotFoundError when entry not found", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "nonexistent" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.getKnowledgeEntry).mockResolvedValue(null);

      await getKnowledgeEntry(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it("should throw NotFoundError when entry belongs to different chatbot", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "entry456" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.getKnowledgeEntry).mockResolvedValue({
        id: "entry456",
        chatbot_id: "different-chatbot",
        question: "Q",
        answer: "A",
        category: null,
        priority: 0,
        enabled: true,
        embedding: [],
        created_at: new Date(),
        updated_at: new Date(),
      } as KnowledgeBase);

      await getKnowledgeEntry(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(NotFoundError);
    });
  });

  describe("updateKnowledgeEntry", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await updateKnowledgeEntry(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should throw NotFoundError when chatbot does not exist", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "entry456" },
        body: { question: "Updated Q" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      await updateKnowledgeEntry(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it("should throw AuthorizationError when user does not own chatbot", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "entry456" },
        body: { question: "Updated Q" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "other-user" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      await updateKnowledgeEntry(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
      expect(error.message).toContain("Not authorized to modify this chatbot");
    });

    it("should throw NotFoundError when entry does not exist", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "entry456" },
        body: { question: "Updated Q" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.getKnowledgeEntry).mockResolvedValue(null);

      await updateKnowledgeEntry(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toContain("Knowledge entry not found");
    });

    it("should throw NotFoundError when entry belongs to different chatbot", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "entry456" },
        body: { question: "Updated Q" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.getKnowledgeEntry).mockResolvedValue({
        id: "entry456",
        chatbot_id: "different-chatbot",
        question: "Q",
        answer: "A",
        category: null,
        priority: 0,
        enabled: true,
        embedding: [],
        created_at: new Date(),
        updated_at: new Date(),
      } as KnowledgeBase);

      await updateKnowledgeEntry(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it("should update entry successfully with all fields", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "entry456" },
        body: {
          question: "Updated Q",
          answer: "Updated A",
          category: "support",
          priority: 10,
          enabled: false,
        },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.getKnowledgeEntry).mockResolvedValue({
        id: "entry456",
        chatbot_id: "chatbot123",
        question: "Q",
        answer: "A",
        category: null,
        priority: 0,
        enabled: true,
        embedding: [],
        created_at: new Date(),
        updated_at: new Date(),
      } as KnowledgeBase);

      vi.mocked(knowledgeBaseService.updateKnowledgeEntry).mockResolvedValue({
        id: "entry456",
        chatbot_id: "chatbot123",
        question: "Updated Q",
        answer: "Updated A",
        category: "support",
        priority: 10,
        enabled: false,
        embedding: [],
        created_at: new Date(),
        updated_at: new Date(),
      } as KnowledgeBase);

      await updateKnowledgeEntry(req, res, mockNext);

      expect(knowledgeBaseService.updateKnowledgeEntry).toHaveBeenCalledWith("entry456", {
        question: "Updated Q",
        answer: "Updated A",
        category: "support",
        priority: 10,
        enabled: false,
      });
      expect(res.json).toHaveBeenCalled();
    });

    it("should handle service errors", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "entry456" },
        body: { question: "Updated Q" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.getKnowledgeEntry).mockResolvedValue({
        id: "entry456",
        chatbot_id: "chatbot123",
        question: "Q",
        answer: "A",
        category: null,
        priority: 0,
        enabled: true,
        embedding: [],
        created_at: new Date(),
        updated_at: new Date(),
      } as KnowledgeBase);

      const serviceError = new Error("Service error");
      vi.mocked(knowledgeBaseService.updateKnowledgeEntry).mockRejectedValue(serviceError);

      await updateKnowledgeEntry(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(serviceError);
    });
  });

  describe("deleteKnowledgeEntry", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await deleteKnowledgeEntry(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should throw NotFoundError when chatbot does not exist", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "entry456" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      await deleteKnowledgeEntry(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it("should throw AuthorizationError when user does not own chatbot", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "entry456" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "other-user" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      await deleteKnowledgeEntry(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
      expect(error.message).toContain("Not authorized to modify this chatbot");
    });

    it("should throw NotFoundError when entry does not exist", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "entry456" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.getKnowledgeEntry).mockResolvedValue(null);

      await deleteKnowledgeEntry(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toContain("Knowledge entry not found");
    });

    it("should delete entry successfully", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "entry456" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.getKnowledgeEntry).mockResolvedValue({
        id: "entry456",
        chatbot_id: "chatbot123",
        question: "Q",
        answer: "A",
        category: null,
        priority: 0,
        enabled: true,
        embedding: [],
        created_at: new Date(),
        updated_at: new Date(),
      } as KnowledgeBase);

      vi.mocked(knowledgeBaseService.deleteKnowledgeEntry).mockResolvedValue(undefined);

      await deleteKnowledgeEntry(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it("should handle service errors", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "entry456" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.getKnowledgeEntry).mockResolvedValue({
        id: "entry456",
        chatbot_id: "chatbot123",
        question: "Q",
        answer: "A",
        category: null,
        priority: 0,
        enabled: true,
        embedding: [],
        created_at: new Date(),
        updated_at: new Date(),
      } as KnowledgeBase);

      const serviceError = new Error("Service error");
      vi.mocked(knowledgeBaseService.deleteKnowledgeEntry).mockRejectedValue(serviceError);

      await deleteKnowledgeEntry(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(serviceError);
    });
  });

  describe("bulkImportKnowledge", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await bulkImportKnowledge(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should throw NotFoundError when chatbot does not exist", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        body: { entries: [{ question: "Q", answer: "A" }] },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      await bulkImportKnowledge(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it("should throw AuthorizationError when user does not own chatbot", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        body: { entries: [{ question: "Q", answer: "A" }] },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "other-user" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      await bulkImportKnowledge(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
      expect(error.message).toContain("Not authorized to modify this chatbot");
    });

    it("should throw ValidationError when entries is not an array", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        body: { entries: "not an array" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      await bulkImportKnowledge(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
    });

    it("should throw ValidationError when entries is empty", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        body: { entries: [] },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      await bulkImportKnowledge(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
    });

    it("should throw ValidationError when entry is missing question", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        body: { entries: [{ answer: "A" }] },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      await bulkImportKnowledge(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
    });

    it("should throw ValidationError when entry is missing answer", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        body: { entries: [{ question: "Q" }] },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      await bulkImportKnowledge(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(ValidationError);
    });

    it("should import entries successfully", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        body: {
          entries: [
            { question: "Q1", answer: "A1" },
            { question: "Q2", answer: "A2" },
          ],
        },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.bulkImport).mockResolvedValue({
        success: 2,
        failed: 0,
      });

      await bulkImportKnowledge(req, res, mockNext);

      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("getKnowledgeStats", () => {
    it("should throw AuthorizationError when user is not authenticated", async () => {
      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await getKnowledgeStats(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
    });

    it("should throw NotFoundError when chatbot does not exist", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      await getKnowledgeStats(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it("should throw AuthorizationError when user does not own chatbot", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "other-user" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      await getKnowledgeStats(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error).toBeInstanceOf(AuthorizationError);
      expect(error.message).toContain("Not authorized to access this chatbot");
    });

    it("should return statistics", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.getStatistics).mockResolvedValue({
        total: 100,
        enabled: 80,
        byCategory: { faq: 50, general: 50 },
      });

      await getKnowledgeStats(req, res, mockNext);

      expect(res.json).toHaveBeenCalled();
    });

    it("should handle service errors", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      const serviceError = new Error("Service error");
      vi.mocked(knowledgeBaseService.getStatistics).mockRejectedValue(serviceError);

      await getKnowledgeStats(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledWith(serviceError);
    });
  });

  describe("Filter building logic", () => {
    it("should build filters correctly with all filters", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        query: { category: "faq", enabled: "true", search: "help", page: "2", limit: "10" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.listKnowledgeEntries).mockResolvedValue({
        entries: [],
        total: 0,
      });

      await listKnowledgeEntries(req, res, mockNext);

      expect(knowledgeBaseService.listKnowledgeEntries).toHaveBeenCalledWith(
        "chatbot123",
        { category: "faq", enabled: true, search: "help" },
        2,
        10
      );
    });

    it("should handle false enabled value", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        query: { enabled: "false" },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.listKnowledgeEntries).mockResolvedValue({
        entries: [],
        total: 0,
      });

      await listKnowledgeEntries(req, res, mockNext);

      expect(knowledgeBaseService.listKnowledgeEntries).toHaveBeenCalledWith(
        "chatbot123",
        { enabled: false },
        1,
        50
      );
    });
  });

  describe("Updates object building", () => {
    it("should build updates object with all fields", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "entry456" },
        body: {
          question: "New Q",
          answer: "New A",
          category: "updated",
          priority: 5,
          enabled: false,
        },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.getKnowledgeEntry).mockResolvedValue({
        id: "entry456",
        chatbot_id: "chatbot123",
        question: "Q",
        answer: "A",
        category: null,
        priority: 0,
        enabled: true,
        embedding: [],
        created_at: new Date(),
        updated_at: new Date(),
      } as KnowledgeBase);

      vi.mocked(knowledgeBaseService.updateKnowledgeEntry).mockResolvedValue({
        id: "entry456",
        chatbot_id: "chatbot123",
        question: "New Q",
        answer: "New A",
        category: "updated",
        priority: 5,
        enabled: false,
        embedding: [],
        created_at: new Date(),
        updated_at: new Date(),
      });

      await updateKnowledgeEntry(req, res, mockNext);

      expect(knowledgeBaseService.updateKnowledgeEntry).toHaveBeenCalledWith("entry456", {
        question: "New Q",
        answer: "New A",
        category: "updated",
        priority: 5,
        enabled: false,
      });
    });

    it("should build updates object with only defined fields", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "entry456" },
        body: {
          question: "New Q",
          priority: 5,
        },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.getKnowledgeEntry).mockResolvedValue({
        id: "entry456",
        chatbot_id: "chatbot123",
        question: "Q",
        answer: "A",
        category: null,
        priority: 0,
        enabled: true,
        embedding: [],
        created_at: new Date(),
        updated_at: new Date(),
      } as KnowledgeBase);

      vi.mocked(knowledgeBaseService.updateKnowledgeEntry).mockResolvedValue({
        id: "entry456",
        chatbot_id: "chatbot123",
        question: "New Q",
        answer: "A",
        category: null,
        priority: 5,
        enabled: true,
        embedding: [],
        created_at: new Date(),
        updated_at: new Date(),
      } as KnowledgeBase);

      await updateKnowledgeEntry(req, res, mockNext);

      expect(knowledgeBaseService.updateKnowledgeEntry).toHaveBeenCalledWith("entry456", {
        question: "New Q",
        priority: 5,
      });
    });

    it("should handle null category in updates", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "entry456" },
        body: {
          category: null,
        },
        user: { userId: "user123", email: "user@example.com" },
      });
      const res = createMockResponse();

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { user_id: "user123" } }),
          }),
        }),
      } as unknown as ReturnType<typeof supabaseAdmin.from>);

      vi.mocked(knowledgeBaseService.getKnowledgeEntry).mockResolvedValue({
        id: "entry456",
        chatbot_id: "chatbot123",
        question: "Q",
        answer: "A",
        category: "old-category",
        priority: 0,
        enabled: true,
        embedding: [],
        created_at: new Date(),
        updated_at: new Date(),
      });

      vi.mocked(knowledgeBaseService.updateKnowledgeEntry).mockResolvedValue({
        id: "entry456",
        chatbot_id: "chatbot123",
        question: "Q",
        answer: "A",
        category: null,
        priority: 0,
        enabled: true,
        embedding: [],
        created_at: new Date(),
        updated_at: new Date(),
      } as KnowledgeBase);

      await updateKnowledgeEntry(req, res, mockNext);

      expect(knowledgeBaseService.updateKnowledgeEntry).toHaveBeenCalledWith("entry456", {
        category: null,
      });
    });
  });
});
