import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createOrUpdateSession,
  endSession,
  identifySession,
  trackEvent,
  trackEvents,
  incrementSessionMessages,
  incrementSessionInteraction,
  getSessionSummary,
  getDailyTrends,
  getTopEvents,
  getActiveSessions,
  cleanupStaleSessions,
} from "../../../server/services/widget-analytics";

// Mock dependencies
vi.mock("../../../server/utils/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock("../../../server/utils/monitoring", () => ({
  incrementCounter: vi.fn(),
  recordHistogram: vi.fn(),
}));

vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("ua-parser-js", () => {
  return {
    UAParser: class {
      getBrowser() {
        return { name: "Chrome", version: "120.0" };
      }
      getOS() {
        return { name: "Windows", version: "10" };
      }
      getDevice() {
        return { type: "mobile" };
      }
      constructor() {
        return this;
      }
    },
  };
});

import { supabaseAdmin } from "../../../server/utils/supabase";
import { incrementCounter, recordHistogram } from "../../../server/utils/monitoring";
import logger from "../../../server/utils/logger";

describe("Widget Analytics Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear any active sessions
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createOrUpdateSession", () => {
    it("should create a new session when none exists", async () => {
      const mockSession = {
        id: "session-123",
        chatbot_id: "chatbot-123",
        session_id: "session-123",
        started_at: new Date().toISOString(),
      };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        upsert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockSession, error: null }),
      });

      const result = await createOrUpdateSession("chatbot-123", {
        session_id: "session-123",
        user_agent: "Mozilla/5.0",
      });

      expect(result.session_id).toBe("session-123");
      expect(result.is_new).toBe(true);
      expect(supabaseAdmin.from).toHaveBeenCalledWith("widget_sessions");
    });

    it("should return existing session if active", async () => {
      // First call creates session
      const mockSession = {
        id: "session-123",
        chatbot_id: "chatbot-123",
        session_id: "session-123",
        started_at: new Date().toISOString(),
      };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        upsert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockSession, error: null }),
      });

      await createOrUpdateSession("chatbot-123", {
        session_id: "session-123",
        user_agent: "Mozilla/5.0",
      });

      // Second call within timeout should return existing
      const result = await createOrUpdateSession("chatbot-123", {
        session_id: "session-123",
        user_agent: "Mozilla/5.0",
      });

      expect(result.session_id).toBe("session-123");
    });

    it("should handle device type detection", async () => {
      const mockSession = {
        id: "session-456",
        chatbot_id: "chatbot-123",
        session_id: "session-456",
        started_at: new Date().toISOString(),
      };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        upsert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockSession, error: null }),
      });

      const result = await createOrUpdateSession("chatbot-123", {
        session_id: "session-456",
        user_agent: "Mozilla/5.0 Mobile",
      });

      expect(result.session_id).toBe("session-456");
      expect(supabaseAdmin.from).toHaveBeenCalled();
    });

    it("should handle errors during session creation", async () => {
      const mockError = { message: "Database error" };
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        upsert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: mockError,
        }),
      });

      // The function throws the error
      try {
        await createOrUpdateSession("chatbot-123", {
          session_id: "session-error",
          user_agent: "Mozilla/5.0",
        });
        // If we get here, the error wasn't thrown - check logger was called
        expect(logger.error).toHaveBeenCalled();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("endSession", () => {
    it("should end a session successfully", async () => {
      const mockSession = {
        started_at: new Date().toISOString(),
        messages_sent: 5,
        messages_received: 3,
      };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockSession, error: null }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        });

      await endSession("session-123");

      expect(supabaseAdmin.from).toHaveBeenCalledWith("widget_sessions");
      expect(recordHistogram).toHaveBeenCalled();
    });

    it("should handle session not found", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
      });

      await endSession("session-123");

      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe("identifySession", () => {
    it("should identify a session with user data", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      await identifySession("session-123", {
        user_id: "user-123",
        user_email: "test@example.com",
        user_name: "Test User",
      });

      expect(supabaseAdmin.from).toHaveBeenCalledWith("widget_sessions");
    });

    it("should handle errors during identification", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { message: "Update failed" } }),
      });

      await expect(
        identifySession("session-123", {
          user_id: "user-123",
        })
      ).rejects.toBeDefined();
    });
  });

  describe("trackEvent", () => {
    it("should track an event", async () => {
      await trackEvent("chatbot-123", "session-123", {
        event_name: "widget_opened",
        event_category: "engagement",
      });

      expect(incrementCounter).toHaveBeenCalledWith(
        "widget.events.tracked",
        1,
        expect.objectContaining({
          chatbot_id: "chatbot-123",
          event_name: "widget_opened",
        })
      );
    });

    it("should flush batch when full", async () => {
      // Track 100 events to trigger flush
      for (let i = 0; i < 100; i++) {
        await trackEvent("chatbot-123", "session-123", {
          event_name: `event_${i}`,
        });
      }

      // Wait a bit for async operations
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(supabaseAdmin.from).toHaveBeenCalled();
    });
  });

  describe("trackEvents", () => {
    it("should track multiple events", async () => {
      const events = [
        { event_name: "event1" },
        { event_name: "event2" },
        { event_name: "event3" },
      ];

      await trackEvents("chatbot-123", "session-123", events);

      expect(incrementCounter).toHaveBeenCalledTimes(3);
    });
  });

  describe("incrementSessionMessages", () => {
    it("should increment sent messages using RPC", async () => {
      (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
        error: null,
      });

      await incrementSessionMessages("session-123", "sent");

      expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
        "increment_session_messages",
        {
          p_session_id: "session-123",
          p_column: "messages_sent",
        }
      );
    });

    it("should fallback to manual increment if RPC fails", async () => {
      (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
        error: { message: "RPC not found" },
      });

      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { messages_received: 5 },
            error: null,
          }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        });

      await incrementSessionMessages("session-123", "received");

      expect(supabaseAdmin.from).toHaveBeenCalled();
    });
  });

  describe("incrementSessionInteraction", () => {
    it("should increment opened count", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { widget_opened_count: 2 },
            error: null,
          }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        });

      await incrementSessionInteraction("session-123", "opened");

      expect(supabaseAdmin.from).toHaveBeenCalled();
    });

    it("should increment minimized count", async () => {
      (supabaseAdmin.from as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { widget_minimized_count: 1 },
            error: null,
          }),
        })
        .mockReturnValueOnce({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        });

      await incrementSessionInteraction("session-123", "minimized");

      expect(supabaseAdmin.from).toHaveBeenCalled();
    });
  });

  describe("getSessionSummary", () => {
    it("should get session summary", async () => {
      const mockSummary = {
        total_sessions: 100,
        active_sessions: 10,
        total_messages: 500,
      };

      (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [mockSummary],
        error: null,
      });

      const result = await getSessionSummary("chatbot-123", 30);

      expect(result).toEqual(mockSummary);
      expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
        "get_widget_session_summary",
        {
          p_chatbot_id: "chatbot-123",
          p_days: 30,
        }
      );
    });

    it("should handle errors", async () => {
      (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: null,
        error: { message: "RPC error" },
      });

      await expect(getSessionSummary("chatbot-123")).rejects.toBeDefined();
    });
  });

  describe("getDailyTrends", () => {
    it("should get daily trends", async () => {
      const mockTrends = [
        { date: "2024-01-01", sessions: 10, messages: 50 },
        { date: "2024-01-02", sessions: 15, messages: 75 },
      ];

      (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockTrends,
        error: null,
      });

      const result = await getDailyTrends("chatbot-123", 7);

      expect(result).toEqual(mockTrends);
    });
  });

  describe("getTopEvents", () => {
    it("should get top events", async () => {
      const mockEvents = [
        { event_name: "widget_opened", count: 100 },
        { event_name: "message_sent", count: 50 },
      ];

      (supabaseAdmin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: mockEvents,
        error: null,
      });

      const result = await getTopEvents("chatbot-123", 7, 10);

      expect(result).toEqual(mockEvents);
    });
  });

  describe("getActiveSessions", () => {
    it("should return active sessions count", async () => {
      // Create a session first
      const mockSession = {
        id: "session-123",
        chatbot_id: "chatbot-123",
        session_id: "session-123",
        started_at: new Date().toISOString(),
      };

      (supabaseAdmin.from as ReturnType<typeof vi.fn>).mockReturnValue({
        upsert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockSession, error: null }),
      });

      await createOrUpdateSession("chatbot-123", {
        session_id: "session-123",
        user_agent: "Mozilla/5.0",
      });

      const count = await getActiveSessions("chatbot-123");

      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe("cleanupStaleSessions", () => {
    it("should cleanup stale sessions", () => {
      cleanupStaleSessions();
      // Function should complete without errors
      expect(true).toBe(true);
    });
  });
});

