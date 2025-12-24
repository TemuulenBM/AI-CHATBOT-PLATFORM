/**
 * Widget Analytics and Error Tracking
 */

import { WidgetAnalyticsEvent, WidgetError } from "../types";

const WIDGET_VERSION = "2.0.0";

class AnalyticsManager {
  private apiUrl: string = "";
  private chatbotId: string = "";
  private sessionId: string = "";
  private eventQueue: WidgetAnalyticsEvent[] = [];
  private flushInterval: number | null = null;
  private errorHandler: ((event: ErrorEvent) => void) | null = null;

  initialize(apiUrl: string, chatbotId: string, sessionId: string): void {
    this.apiUrl = apiUrl;
    this.chatbotId = chatbotId;
    this.sessionId = sessionId;

    // Start event flush interval (every 30 seconds)
    this.flushInterval = window.setInterval(() => {
      this.flush();
    }, 30000);

    // Set up global error handler
    this.setupErrorHandler();

    // Flush on page unload
    window.addEventListener("beforeunload", () => {
      this.flush();
    });
  }

  private setupErrorHandler(): void {
    this.errorHandler = (event: ErrorEvent) => {
      // Only track widget-related errors
      if (event.filename?.includes("widget") || event.message?.includes("ConvoAI")) {
        this.trackError({
          message: event.message,
          stack: event.error?.stack,
          url: event.filename,
          line: event.lineno,
          column: event.colno,
          timestamp: Date.now(),
          widgetVersion: WIDGET_VERSION,
          userAgent: navigator.userAgent,
        });
      }
    };

    window.addEventListener("error", this.errorHandler);
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    if (this.errorHandler) {
      window.removeEventListener("error", this.errorHandler);
      this.errorHandler = null;
    }

    // Final flush
    this.flush();
  }

  track(type: WidgetAnalyticsEvent["type"], data?: Record<string, unknown>): void {
    this.eventQueue.push({
      type,
      timestamp: Date.now(),
      data,
    });

    // Immediate flush for important events
    if (type === "open" || type === "feedback") {
      this.flush();
    }
  }

  trackError(error: WidgetError): void {
    // Send errors immediately
    this.sendToServer("/api/widget/errors", {
      chatbotId: this.chatbotId,
      sessionId: this.sessionId,
      error,
    });
  }

  private async flush(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];

    await this.sendToServer("/api/widget/analytics", {
      chatbotId: this.chatbotId,
      sessionId: this.sessionId,
      events,
    });
  }

  private async sendToServer(endpoint: string, data: unknown): Promise<void> {
    if (!this.apiUrl) return;

    try {
      // Use sendBeacon for reliability during page unload
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
        navigator.sendBeacon(`${this.apiUrl}${endpoint}`, blob);
      } else {
        fetch(`${this.apiUrl}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          keepalive: true,
        }).catch(() => {
          // Silently fail - analytics should never break the widget
        });
      }
    } catch {
      // Silently fail
    }
  }

  // Performance tracking
  trackLoadTime(startTime: number): void {
    const loadTime = Date.now() - startTime;
    this.track("open", { loadTimeMs: loadTime });
  }
}

// Singleton instance
export const analytics = new AnalyticsManager();

// Convenience functions
export function trackWidgetOpen(): void {
  analytics.track("open");
}

export function trackWidgetClose(): void {
  analytics.track("close");
}

export function trackMessageSent(): void {
  analytics.track("message_sent");
}

export function trackMessageReceived(): void {
  analytics.track("message_received");
}

export function trackFeedback(rating: "positive" | "negative"): void {
  analytics.track("feedback", { rating });
}

export function trackPreChatSubmitted(): void {
  analytics.track("prechat_submitted");
}

export function trackProactiveShown(triggerId: string): void {
  analytics.track("proactive_shown", { triggerId });
}
