import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import gdprRoutes from "../../../server/routes/gdpr";

// Mock all dependencies
vi.mock("../../../server/controllers/gdpr/consent", () => ({
  recordConsent: vi.fn((req, res) => res.status(200).json({ success: true })),
  getConsentStatus: vi.fn((req, res) => res.status(200).json({ consented: true })),
  withdrawConsent: vi.fn((req, res) => res.status(200).json({ success: true })),
  getConsentHistory: vi.fn((req, res) => res.status(200).json({ history: [] })),
}));

vi.mock("../../../server/controllers/gdpr/privacy-policy", () => ({
  getActivePrivacyPolicy: vi.fn((req, res) => res.status(200).json({ policy: "..." })),
  getAllVersions: vi.fn((req, res) => res.status(200).json({ versions: [] })),
  getPrivacyPolicyByVersion: vi.fn((req, res) => res.status(200).json({ policy: "..." })),
  createVersion: vi.fn((req, res) => res.status(201).json({ version: "1.0" })),
  updateVersion: vi.fn((req, res) => res.status(200).json({ success: true })),
}));

vi.mock("../../../server/controllers/gdpr/data-export", () => ({
  listExportRequests: vi.fn((req, res) => res.status(200).json({ requests: [] })),
  requestDataExport: vi.fn((req, res) => res.status(202).json({ request_id: "req-123" })),
  getExportStatus: vi.fn((req, res) => res.status(200).json({ status: "completed" })),
  downloadExport: vi.fn((req, res) => res.status(200).json({ url: "https://export.com" })),
}));

vi.mock("../../../server/controllers/gdpr/deletion", () => ({
  listDeletionRequests: vi.fn((req, res) => res.status(200).json({ requests: [] })),
  getDeletionStatus: vi.fn((req, res) => res.status(200).json({ status: "pending" })),
  requestAccountDeletion: vi.fn((req, res) => res.status(202).json({ request_id: "req-123" })),
  cancelDeletionRequest: vi.fn((req, res) => res.status(200).json({ success: true })),
}));

vi.mock("../../../server/middleware/clerkAuth", () => ({
  clerkAuthMiddleware: vi.fn((req: any, res: any, next: any) => {
    req.user = { userId: "user-123" };
    next();
  }),
  optionalClerkAuthMiddleware: vi.fn((req: any, res: any, next: any) => next()),
}));

vi.mock("../../../server/middleware/adminAuth", () => ({
  loadAdminStatus: vi.fn((req: any, res: any, next: any) => {
    req.isAdmin = true; // Mock as admin for unit tests
    next();
  }),
  requireAdmin: vi.fn((req: any, res: any, next: any) => {
    if (!req.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  }),
}));

describe("GDPR Routes", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api/gdpr", gdprRoutes);
    vi.clearAllMocks();
  });

  describe("POST /api/gdpr/consent", () => {
    it("should record consent", async () => {
      const response = await request(app)
        .post("/api/gdpr/consent")
        .send({ category: "analytics", consented: true });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe("GET /api/gdpr/consent", () => {
    it("should get consent status", async () => {
      const response = await request(app).get("/api/gdpr/consent");

      expect(response.status).toBe(200);
      expect(response.body.consented).toBe(true);
    });
  });

  describe("DELETE /api/gdpr/consent", () => {
    it("should withdraw consent", async () => {
      const response = await request(app)
        .delete("/api/gdpr/consent")
        .send({ category: "analytics" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe("GET /api/gdpr/consent/history", () => {
    it("should get consent history", async () => {
      const response = await request(app).get("/api/gdpr/consent/history");

      expect(response.status).toBe(200);
      expect(response.body.history).toEqual([]);
    });
  });

  describe("GET /api/gdpr/privacy-policy", () => {
    it("should get privacy policy", async () => {
      const response = await request(app).get("/api/gdpr/privacy-policy");

      expect(response.status).toBe(200);
      expect(response.body.policy).toBeDefined();
    });
  });

  describe("POST /api/gdpr/privacy-policy", () => {
    it("should create privacy policy version", async () => {
      const response = await request(app)
        .post("/api/gdpr/privacy-policy")
        .send({ content: "Policy content" });

      expect(response.status).toBe(201);
    });
  });

  describe("POST /api/gdpr/data-export", () => {
    it("should request data export", async () => {
      const response = await request(app).post("/api/gdpr/data-export");

      expect(response.status).toBe(202);
      expect(response.body.request_id).toBe("req-123");
    });
  });

  describe("GET /api/gdpr/data-export/:requestId/status", () => {
    it("should get export status", async () => {
      const response = await request(app).get("/api/gdpr/data-export/req-123/status");

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("completed");
    });
  });

  describe("GET /api/gdpr/data-export/:requestId/download", () => {
    it("should download export", async () => {
      const response = await request(app).get("/api/gdpr/data-export/req-123/download");

      expect(response.status).toBe(200);
      expect(response.body.url).toBeDefined();
    });
  });

  describe("POST /api/gdpr/delete-account", () => {
    it("should request account deletion", async () => {
      const response = await request(app).post("/api/gdpr/delete-account");

      expect(response.status).toBe(202);
      expect(response.body.request_id).toBe("req-123");
    });
  });

  describe("GET /api/gdpr/delete-account/status", () => {
    it("should get deletion status", async () => {
      const response = await request(app).get("/api/gdpr/delete-account/status");

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("pending");
    });
  });

  describe("DELETE /api/gdpr/delete-account/:requestId", () => {
    it("should cancel deletion request", async () => {
      const response = await request(app).delete("/api/gdpr/delete-account/req-123");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe("GET /api/gdpr/delete-account", () => {
    it("should list deletion requests", async () => {
      const response = await request(app).get("/api/gdpr/delete-account");

      expect(response.status).toBe(200);
      expect(response.body.requests).toEqual([]);
    });
  });
});

