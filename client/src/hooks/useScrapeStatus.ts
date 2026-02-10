import { useState, useEffect, useRef } from "react";
import { ScrapeStatus } from "@/components/dashboard/ScrapeStatusBadge";

export interface ScrapeHistoryEntry {
  id: string;
  chatbot_id: string;
  status: ScrapeStatus;
  pages_scraped: number;
  embeddings_created: number;
  error_message: string | null;
  triggered_by: "manual" | "scheduled" | "initial";
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface ScrapeHistoryResponse {
  history: ScrapeHistoryEntry[];
  last_scraped_at: string | null;
  next_scheduled_scrape: string | null;
}

interface UseScrapeStatusOptions {
  /** Enable automatic polling for in-progress scrapes */
  autoRefresh?: boolean;
  /** Polling interval in milliseconds (default: 3000ms / 3 seconds) */
  pollInterval?: number;
  /** Maximum polling duration in milliseconds (default: 300000ms / 5 minutes) */
  maxPollDuration?: number;
  /** Scrape дуусахад (completed/failed) дуудагдах callback — chatbot data refetch хийхэд ашиглана */
  onComplete?: () => void;
}

interface UseScrapeStatusReturn {
  /** Current scrape status data */
  status: ScrapeHistoryResponse | null;
  /** Whether actively polling */
  isPolling: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Error if fetch failed */
  error: string | null;
  /** Manually trigger a refresh */
  refetch: () => Promise<void>;
  /** Stop polling */
  stopPolling: () => void;
}

/**
 * Hook to fetch and poll scrape status for a chatbot
 * Automatically polls while status is "pending" or "in_progress"
 * getToken: Clerk auth token авах функц — backend auth middleware-д шаардлагатай
 */
export function useScrapeStatus(
  chatbotId: string | undefined,
  getToken: (() => Promise<string | null>) | undefined,
  options: UseScrapeStatusOptions = {}
): UseScrapeStatusReturn {
  const {
    autoRefresh = true,
    pollInterval = 3000,
    maxPollDuration = 300000, // 5 minutes
    onComplete,
  } = options;

  const [status, setStatus] = useState<ScrapeHistoryResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollStartTimeRef = useRef<number | null>(null);

  const fetchStatus = async () => {
    if (!chatbotId) {
      setError("No chatbot ID provided");
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Auth header бэлдэх — backend auth middleware Bearer token шаарддаг
      const headers: Record<string, string> = {};
      if (getToken) {
        try {
          const token = await getToken();
          if (token) {
            headers.Authorization = `Bearer ${token}`;
          }
        } catch { /* Token авч чадаагүй — header-гүй үргэлжлүүлнэ */ }
      }

      const response = await fetch(`/api/chatbots/${chatbotId}/scrape-history`, { headers });

      if (!response.ok) {
        throw new Error(`Failed to fetch scrape history: ${response.statusText}`);
      }

      const data: ScrapeHistoryResponse = await response.json();
      setStatus(data);

      // Scrape дуусвал polling зогсоож, onComplete callback дуудна
      const latestEntry = data.history[0];
      if (
        latestEntry &&
        (latestEntry.status === "completed" || latestEntry.status === "failed")
      ) {
        stopPolling();
        onComplete?.();
      }

      return data;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error fetching scrape status";
      setError(errorMessage);
      console.error("Error fetching scrape status:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPolling(false);
    pollStartTimeRef.current = null;
  };

  const startPolling = () => {
    if (!autoRefresh || !chatbotId) return;

    // Initial fetch
    fetchStatus();

    // Start polling
    setIsPolling(true);
    pollStartTimeRef.current = Date.now();

    pollIntervalRef.current = setInterval(async () => {
      // Check if max poll duration exceeded
      if (
        pollStartTimeRef.current &&
        Date.now() - pollStartTimeRef.current > maxPollDuration
      ) {
        console.warn("Max polling duration exceeded, stopping poll");
        stopPolling();
        return;
      }

      await fetchStatus();
    }, pollInterval);
  };

  // Start polling when component mounts or chatbotId changes
  useEffect(() => {
    if (chatbotId && autoRefresh) {
      startPolling();
    }

    return () => {
      stopPolling();
    };
  }, [chatbotId, autoRefresh]);

  return {
    status,
    isPolling,
    isLoading,
    error,
    refetch: async () => { await fetchStatus(); },
    stopPolling,
  };
}
