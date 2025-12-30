import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";

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
function createMockRequest(overrides: Partial<Request> = {}): Request & { user?: { userId: string } } {
  return {
    body: {},
    params: {},
    query: {},
    user: { userId: "user123" },
    ...overrides,
  } as Request & { user?: { userId: string } };
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
        user: { userId: "user123" },
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
        user: { userId: "user123" },
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
        user: { userId: "user123" },
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await addKnowledgeEntry(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("listKnowledgeEntries", () => {
    it("should list entries with filters", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        query: { category: "faq", enabled: "true", search: "help", page: "1", limit: "20" },
        user: { userId: "user123" },
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
        page: 1,
        limit: 20,
      });

      await listKnowledgeEntries(req, res, mockNext);

      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("getKnowledgeEntry", () => {
    it("should get a single entry", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "entry456" },
        user: { userId: "user123" },
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await getKnowledgeEntry(req, res, mockNext);

      expect(res.json).toHaveBeenCalled();
    });

    it("should throw NotFoundError when entry not found", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "nonexistent" },
        user: { userId: "user123" },
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
  });

  describe("updateKnowledgeEntry", () => {
    it("should update entry successfully", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "entry456" },
        body: { question: "Updated Q", priority: 10 },
        user: { userId: "user123" },
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      vi.mocked(knowledgeBaseService.updateKnowledgeEntry).mockResolvedValue({
        id: "entry456",
        chatbot_id: "chatbot123",
        question: "Updated Q",
        answer: "A",
        category: null,
        priority: 10,
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await updateKnowledgeEntry(req, res, mockNext);

      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("deleteKnowledgeEntry", () => {
    it("should delete entry successfully", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123", entryId: "entry456" },
        user: { userId: "user123" },
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      vi.mocked(knowledgeBaseService.deleteKnowledgeEntry).mockResolvedValue(undefined);

      await deleteKnowledgeEntry(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });
  });

  describe("bulkImportKnowledge", () => {
    it("should throw ValidationError when entries is not an array", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        body: { entries: "not an array" },
        user: { userId: "user123" },
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
        user: { userId: "user123" },
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
        user: { userId: "user123" },
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
        user: { userId: "user123" },
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
        errors: [],
      });

      await bulkImportKnowledge(req, res, mockNext);

      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("getKnowledgeStats", () => {
    it("should return statistics", async () => {
      const req = createMockRequest({
        params: { id: "chatbot123" },
        user: { userId: "user123" },
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
        totalEntries: 100,
        enabledEntries: 80,
        categoryCounts: { faq: 50, general: 50 },
      });

      await getKnowledgeStats(req, res, mockNext);

      expect(res.json).toHaveBeenCalled();
    });
  });

  describe("Filter building logic", () => {
    it("should build filters correctly", () => {
      const query = {
        category: "faq",
        enabled: "true",
        search: "help",
      };

      const filters: {
        category?: string;
        enabled?: boolean;
        search?: string;
      } = {};

      if (query.category) {
        filters.category = query.category;
      }

      if (query.enabled !== undefined) {
        filters.enabled = query.enabled === "true";
      }

      if (query.search) {
        filters.search = query.search;
      }

      expect(filters.category).toBe("faq");
      expect(filters.enabled).toBe(true);
      expect(filters.search).toBe("help");
    });

    it("should handle false enabled value", () => {
      const enabled = "false";
      const parsedEnabled = enabled === "true";

      expect(parsedEnabled).toBe(false);
    });
  });

  describe("Updates object building", () => {
    it("should build updates object with only defined fields", () => {
      const body = {
        question: "New Q",
        priority: 5,
      };

      const updates: Record<string, unknown> = {};

      if (body.question !== undefined) updates.question = body.question;
      if ((body as Record<string, unknown>).answer !== undefined) updates.answer = (body as Record<string, unknown>).answer;
      if ((body as Record<string, unknown>).category !== undefined) updates.category = (body as Record<string, unknown>).category;
      if (body.priority !== undefined) updates.priority = body.priority;

      expect(updates).toHaveProperty("question");
      expect(updates).toHaveProperty("priority");
      expect(updates).not.toHaveProperty("answer");
      expect(updates).not.toHaveProperty("category");
    });
  });
});
