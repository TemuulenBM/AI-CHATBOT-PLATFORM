import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import express, { Express, Request, Response, NextFunction } from "express";
import request from "supertest";

// Set environment variables before any imports
process.env.CLERK_SECRET_KEY = "test-clerk-secret";
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.REDIS_URL = "redis://localhost:6379";

// Mock all external dependencies
vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    users: {
      getUser: vi.fn().mockResolvedValue({
        id: "user_test123",
        emailAddresses: [{ emailAddress: "test@example.com" }],
      }),
    },
  }),
  verifyToken: vi.fn().mockResolvedValue({ sub: "user_test123" }),
}));

vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null, data: { id: "entry_new" } }),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({
      data: { allowed: true },
      error: null,
    }),
  },
  PLAN_LIMITS: {
    free: { chatbots: 1, messages: 100, price: 0 },
    starter: { chatbots: 3, messages: 2000, price: 4900 },
    growth: { chatbots: 10, messages: 10000, price: 9900 },
    business: { chatbots: 999, messages: 50000, price: 29900 },
  },
}));

vi.mock("../../../server/utils/redis", () => ({
  getCache: vi.fn().mockResolvedValue(null),
  setCache: vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../server/services/knowledge-base", () => ({
  knowledgeBaseService: {
    addKnowledgeEntry: vi.fn().mockResolvedValue({
      id: "entry_new",
      chatbot_id: "chatbot_test123",
      question: "Test question",
      answer: "Test answer",
      category: null,
      priority: 0,
      enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    listKnowledgeEntries: vi.fn().mockResolvedValue({
      entries: [],
      total: 0,
      page: 1,
      limit: 50,
    }),
    getKnowledgeEntry: vi.fn().mockResolvedValue({
      id: "entry_test123",
      chatbot_id: "chatbot_test123",
      question: "Test question",
      answer: "Test answer",
      category: null,
      priority: 0,
      enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    updateKnowledgeEntry: vi.fn().mockResolvedValue({
      id: "entry_test123",
      chatbot_id: "chatbot_test123",
      question: "Updated question",
      answer: "Updated answer",
    }),
    deleteKnowledgeEntry: vi.fn().mockResolvedValue(undefined),
    bulkImport: vi.fn().mockResolvedValue({
      success: 2,
      failed: 0,
      errors: [],
    }),
    getStatistics: vi.fn().mockResolvedValue({
      totalEntries: 10,
      enabledEntries: 8,
      categoryCounts: { faq: 5, general: 5 },
    }),
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

import { verifyToken } from "@clerk/backend";
import { supabaseAdmin } from "../../../server/utils/supabase";

describe("Knowledge Base API Endpoints", () => {
  let app: Express;
  let addKnowledgeEntry: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  let listKnowledgeEntries: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  let getKnowledgeEntry: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  let updateKnowledgeEntry: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  let deleteKnowledgeEntry: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  let bulkImportKnowledge: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  let getKnowledgeStats: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  let clerkAuthMiddleware: (req: Request, res: Response, next: NextFunction) => Promise<void>;

  beforeAll(async () => {
    const controllers = await import("../../../server/controllers/knowledge-base");
    addKnowledgeEntry = controllers.addKnowledgeEntry;
    listKnowledgeEntries = controllers.listKnowledgeEntries;
    getKnowledgeEntry = controllers.getKnowledgeEntry;
    updateKnowledgeEntry = controllers.updateKnowledgeEntry;
    deleteKnowledgeEntry = controllers.deleteKnowledgeEntry;
    bulkImportKnowledge = controllers.bulkImportKnowledge;
    getKnowledgeStats = controllers.getKnowledgeStats;

    const middleware = await import("../../../server/middleware/clerkAuth");
    clerkAuthMiddleware = middleware.clerkAuthMiddleware;
  });

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Setup routes
    app.post("/api/chatbots/:id/knowledge", clerkAuthMiddleware, addKnowledgeEntry);
    app.get("/api/chatbots/:id/knowledge", clerkAuthMiddleware, listKnowledgeEntries);
    app.get("/api/chatbots/:id/knowledge/stats", clerkAuthMiddleware, getKnowledgeStats);
    app.get("/api/chatbots/:id/knowledge/:entryId", clerkAuthMiddleware, getKnowledgeEntry);
    app.patch("/api/chatbots/:id/knowledge/:entryId", clerkAuthMiddleware, updateKnowledgeEntry);
    app.delete("/api/chatbots/:id/knowledge/:entryId", clerkAuthMiddleware, deleteKnowledgeEntry);
    app.post("/api/chatbots/:id/knowledge/bulk", clerkAuthMiddleware, bulkImportKnowledge);

    // Error handler
    app.use((err: Error & { statusCode?: number }, req: Request, res: Response, next: NextFunction) => {
      res.status(err.statusCode || 500).json({ message: err.message });
    });

    vi.clearAllMocks();
    (verifyToken as ReturnType<typeof vi.fn>).mockResolvedValue({ sub: "user_test123" });
  });

  describe("POST /api/chatbots/:id/knowledge", () => {
    it("should add a knowledge entry", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { user_id: "user_test123" },
          error: null,
        }),
      });

      const response = await request(app)
        .post("/api/chatbots/chatbot_test123/knowledge")
        .set("Authorization", "Bearer test-token")
        .send({
          question: "Test question",
          answer: "Test answer",
        });

      expect(response.status).toBe(201);
    });

    it("should require question and answer", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { user_id: "user_test123" },
          error: null,
        }),
      });

      const response = await request(app)
        .post("/api/chatbots/chatbot_test123/knowledge")
        .set("Authorization", "Bearer test-token")
        .send({ question: "Only question" });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/chatbots/:id/knowledge", () => {
    it("should list knowledge entries", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { user_id: "user_test123" },
          error: null,
        }),
      });

      const response = await request(app)
        .get("/api/chatbots/chatbot_test123/knowledge")
        .set("Authorization", "Bearer test-token");

      expect(response.status).toBe(200);
    });

    it("should support filtering by category", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { user_id: "user_test123" },
          error: null,
        }),
      });

      const response = await request(app)
        .get("/api/chatbots/chatbot_test123/knowledge?category=faq&enabled=true")
        .set("Authorization", "Bearer test-token");

      expect(response.status).toBe(200);
    });
  });

  describe("GET /api/chatbots/:id/knowledge/:entryId", () => {
    it("should get a specific entry", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { user_id: "user_test123" },
          error: null,
        }),
      });

      const response = await request(app)
        .get("/api/chatbots/chatbot_test123/knowledge/entry_test123")
        .set("Authorization", "Bearer test-token");

      expect(response.status).toBe(200);
    });
  });

  describe("PATCH /api/chatbots/:id/knowledge/:entryId", () => {
    it("should update an entry", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { user_id: "user_test123" },
          error: null,
        }),
      });

      const response = await request(app)
        .patch("/api/chatbots/chatbot_test123/knowledge/entry_test123")
        .set("Authorization", "Bearer test-token")
        .send({ question: "Updated question" });

      expect(response.status).toBe(200);
    });
  });

  describe("DELETE /api/chatbots/:id/knowledge/:entryId", () => {
    it("should delete an entry", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { user_id: "user_test123" },
          error: null,
        }),
      });

      const response = await request(app)
        .delete("/api/chatbots/chatbot_test123/knowledge/entry_test123")
        .set("Authorization", "Bearer test-token");

      expect(response.status).toBe(204);
    });
  });

  describe("POST /api/chatbots/:id/knowledge/bulk", () => {
    it("should bulk import entries", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { user_id: "user_test123" },
          error: null,
        }),
      });

      const response = await request(app)
        .post("/api/chatbots/chatbot_test123/knowledge/bulk")
        .set("Authorization", "Bearer test-token")
        .send({
          entries: [
            { question: "Q1", answer: "A1" },
            { question: "Q2", answer: "A2" },
          ],
        });

      expect(response.status).toBe(200);
    });

    it("should reject empty entries array", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { user_id: "user_test123" },
          error: null,
        }),
      });

      const response = await request(app)
        .post("/api/chatbots/chatbot_test123/knowledge/bulk")
        .set("Authorization", "Bearer test-token")
        .send({ entries: [] });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/chatbots/:id/knowledge/stats", () => {
    it("should return knowledge base statistics", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { user_id: "user_test123" },
          error: null,
        }),
      });

      const response = await request(app)
        .get("/api/chatbots/chatbot_test123/knowledge/stats")
        .set("Authorization", "Bearer test-token");

      expect(response.status).toBe(200);
    });
  });
});
