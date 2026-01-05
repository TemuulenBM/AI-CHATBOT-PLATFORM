import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response } from "express";
import {
  listExportRequests,
  requestDataExport,
  getExportStatus,
  downloadExport,
} from "../../../server/controllers/gdpr/data-export";

// Mock Supabase
vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

// Mock queue
vi.mock("../../../server/jobs/queue", () => ({
  addJob: vi.fn(),
}));

// Mock fs
vi.mock("fs", () => ({
  createReadStream: vi.fn(),
  existsSync: vi.fn(),
}));

import { supabaseAdmin } from "../../../server/utils/supabase";
import { addJob } from "../../../server/jobs/queue";
import { createReadStream, existsSync } from "fs";

// Helper factories
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as unknown as Request;
}

function createMockResponse(): Response & {
  _json: any;
  _status: number;
  setHeader: any;
} {
  const res = {
    _json: null,
    _status: 200,
    status: vi.fn(function (code: number) {
      res._status = code;
      return res;
    }),
    json: vi.fn(function (data: any) {
      res._json = data;
      return res;
    }),
    setHeader: vi.fn(),
  } as any;
  return res;
}

describe("GDPR Data Export Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listExportRequests", () => {
    it("should list all export requests for authenticated user", async () => {
      const exports = [
        {
          id: "export123",
          status: "completed",
          export_format: "json",
          request_date: "2024-01-01",
          completed_at: "2024-01-02",
          expires_at: "2024-01-09",
          file_size_bytes: 1048576,
        },
        {
          id: "export456",
          status: "pending",
          export_format: "json",
          request_date: "2024-01-03",
          completed_at: null,
          expires_at: null,
          file_size_bytes: null,
        },
      ];

      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: exports,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        auth: { userId: "user123" },
      } as any);
      const res = createMockResponse();

      await listExportRequests(req, res);

      expect(res._status).toBe(200);
      expect(res._json.exports).toHaveLength(2);
      expect(res._json.exports[0].requestId).toBe("export123");
      expect(res._json.exports[0].fileSizeMB).toBe("1.00");
    });

    it("should return 401 when user is not authenticated", async () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      await listExportRequests(req, res);

      expect(res._status).toBe(401);
      expect(res._json.error).toBe("Authentication required");
    });

    it("should return empty array when no exports exist", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        auth: { userId: "user123" },
      } as any);
      const res = createMockResponse();

      await listExportRequests(req, res);

      expect(res._status).toBe(200);
      expect(res._json.exports).toEqual([]);
    });

    it("should calculate canDownload correctly", async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const exports = [
        {
          id: "export1",
          status: "completed",
          export_format: "json",
          request_date: "2024-01-01",
          completed_at: "2024-01-02",
          expires_at: futureDate,
          file_size_bytes: 1024,
        },
        {
          id: "export2",
          status: "completed",
          export_format: "json",
          request_date: "2024-01-01",
          completed_at: "2024-01-02",
          expires_at: pastDate,
          file_size_bytes: 1024,
        },
      ];

      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: exports,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        auth: { userId: "user123" },
      } as any);
      const res = createMockResponse();

      await listExportRequests(req, res);

      expect(res._json.exports[0].canDownload).toBe(true);
      expect(res._json.exports[1].canDownload).toBe(false);
    });

    it("should handle database errors", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        auth: { userId: "user123" },
      } as any);
      const res = createMockResponse();

      await listExportRequests(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toBe("Failed to list exports");
    });
  });

  describe("requestDataExport", () => {
    it("should create data export request", async () => {
      const checkBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      const insertBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: "export123",
            user_id: "user123",
            status: "pending",
            export_format: "json",
          },
          error: null,
        }),
      };

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation(() => {
        callCount++;
        if (callCount === 1) return checkBuilder as any;
        if (callCount === 2) return insertBuilder as any;
        return {} as any;
      });

      vi.mocked(addJob).mockResolvedValue(undefined as any);

      const req = createMockRequest({
        auth: { userId: "user123" },
        body: { format: "json" },
      } as any);
      const res = createMockResponse();

      await requestDataExport(req, res);

      expect(res._status).toBe(202);
      expect(res._json.requestId).toBe("export123");
      expect(res._json.status).toBe("pending");
      expect(addJob).toHaveBeenCalledWith("data-export", {
        requestId: "export123",
        userId: "user123",
        format: "json",
      });
    });

    it("should return 401 when user is not authenticated", async () => {
      const req = createMockRequest({
        body: { format: "json" },
      });
      const res = createMockResponse();

      await requestDataExport(req, res);

      expect(res._status).toBe(401);
      expect(res._json.error).toBe("Authentication required");
    });

    it("should enforce rate limit of 1 export per 24 hours", async () => {
      const recentDate = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [{ id: "recent_export" }],
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        auth: { userId: "user123" },
        body: { format: "json" },
      } as any);
      const res = createMockResponse();

      await requestDataExport(req, res);

      expect(res._status).toBe(429);
      expect(res._json.error).toBe(
        "Rate limit exceeded. You can request 1 export per 24 hours."
      );
    });

    it("should use default format when not specified", async () => {
      const checkBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      };

      const insertBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: "export123",
            export_format: "json",
          },
          error: null,
        }),
      };

      let callCount = 0;
      vi.mocked(supabaseAdmin.from).mockImplementation(() => {
        callCount++;
        if (callCount === 1) return checkBuilder as any;
        if (callCount === 2) return insertBuilder as any;
        return {} as any;
      });

      const req = createMockRequest({
        auth: { userId: "user123" },
        body: {},
      } as any);
      const res = createMockResponse();

      await requestDataExport(req, res);

      expect(res._status).toBe(202);
    });

    it("should handle database errors", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        limit: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        auth: { userId: "user123" },
        body: { format: "json" },
      } as any);
      const res = createMockResponse();

      await requestDataExport(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toBe("Failed to request export");
    });
  });

  describe("getExportStatus", () => {
    it("should return export request status", async () => {
      const request = {
        id: "export123",
        status: "completed",
        export_format: "json",
        request_date: "2024-01-01",
        completed_at: "2024-01-02",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        file_size_bytes: 2097152,
        error_message: null,
      };

      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: request,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        auth: { userId: "user123" },
        params: { requestId: "export123" },
      } as any);
      const res = createMockResponse();

      await getExportStatus(req, res);

      expect(res._status).toBe(200);
      expect(res._json.requestId).toBe("export123");
      expect(res._json.status).toBe("completed");
      expect(res._json.fileSizeMB).toBe("2.00");
      expect(res._json.canDownload).toBe(true);
    });

    it("should return 401 when user is not authenticated", async () => {
      const req = createMockRequest({
        params: { requestId: "export123" },
      });
      const res = createMockResponse();

      await getExportStatus(req, res);

      expect(res._status).toBe(401);
      expect(res._json.error).toBe("Authentication required");
    });

    it("should return 404 when export request not found", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        auth: { userId: "user123" },
        params: { requestId: "nonexistent" },
      } as any);
      const res = createMockResponse();

      await getExportStatus(req, res);

      expect(res._status).toBe(404);
      expect(res._json.error).toBe("Export request not found");
    });

    it("should handle pending status", async () => {
      const request = {
        id: "export123",
        status: "pending",
        export_format: "json",
        request_date: "2024-01-01",
        completed_at: null,
        expires_at: null,
        file_size_bytes: null,
        error_message: null,
      };

      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: request,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        auth: { userId: "user123" },
        params: { requestId: "export123" },
      } as any);
      const res = createMockResponse();

      await getExportStatus(req, res);

      expect(res._json.status).toBe("pending");
      expect(res._json.canDownload).toBe(false);
    });

    it("should handle database errors", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        auth: { userId: "user123" },
        params: { requestId: "export123" },
      } as any);
      const res = createMockResponse();

      await getExportStatus(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toBe("Failed to get status");
    });
  });

  describe("downloadExport", () => {
    it("should stream export file for download", async () => {
      const request = {
        id: "export123",
        status: "completed",
        file_path: "/path/to/export.zip",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: request,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);
      vi.mocked(existsSync).mockReturnValue(true);

      const mockStream = {
        pipe: vi.fn(),
      };
      vi.mocked(createReadStream).mockReturnValue(mockStream as any);

      const req = createMockRequest({
        auth: { userId: "user123" },
        params: { requestId: "export123" },
      } as any);
      const res = createMockResponse();

      await downloadExport(req, res);

      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/zip");
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        'attachment; filename="convoai-data-export-export123.zip"'
      );
      expect(mockStream.pipe).toHaveBeenCalledWith(res);
    });

    it("should return 401 when user is not authenticated", async () => {
      const req = createMockRequest({
        params: { requestId: "export123" },
      });
      const res = createMockResponse();

      await downloadExport(req, res);

      expect(res._status).toBe(401);
      expect(res._json.error).toBe("Authentication required");
    });

    it("should return 404 when export request not found", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        auth: { userId: "user123" },
        params: { requestId: "nonexistent" },
      } as any);
      const res = createMockResponse();

      await downloadExport(req, res);

      expect(res._status).toBe(404);
      expect(res._json.error).toBe("Export request not found");
    });

    it("should return 400 when export is not completed", async () => {
      const request = {
        id: "export123",
        status: "pending",
        file_path: null,
        expires_at: null,
      };

      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: request,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        auth: { userId: "user123" },
        params: { requestId: "export123" },
      } as any);
      const res = createMockResponse();

      await downloadExport(req, res);

      expect(res._status).toBe(400);
      expect(res._json.error).toBe("Export is not ready for download");
    });

    it("should return 410 when export has expired", async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const request = {
        id: "export123",
        status: "completed",
        file_path: "/path/to/export.zip",
        expires_at: pastDate,
      };

      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: request,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        auth: { userId: "user123" },
        params: { requestId: "export123" },
      } as any);
      const res = createMockResponse();

      await downloadExport(req, res);

      expect(res._status).toBe(410);
      expect(res._json.error).toBe("Export has expired. Please request a new export.");
    });

    it("should return 404 when file does not exist", async () => {
      const request = {
        id: "export123",
        status: "completed",
        file_path: "/path/to/nonexistent.zip",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: request,
          error: null,
        }),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);
      vi.mocked(existsSync).mockReturnValue(false);

      const req = createMockRequest({
        auth: { userId: "user123" },
        params: { requestId: "export123" },
      } as any);
      const res = createMockResponse();

      await downloadExport(req, res);

      expect(res._status).toBe(404);
      expect(res._json.error).toBe("Export file not found");
    });

    it("should handle database errors", async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockRejectedValue(new Error("Database error")),
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue(builder as any);

      const req = createMockRequest({
        auth: { userId: "user123" },
        params: { requestId: "export123" },
      } as any);
      const res = createMockResponse();

      await downloadExport(req, res);

      expect(res._status).toBe(500);
      expect(res._json.error).toBe("Failed to download export");
    });
  });
});
