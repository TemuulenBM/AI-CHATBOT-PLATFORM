/**
 * Widget Analytics Service
 *
 * Industry-standard analytics implementation following best practices:
 * - Event batching to reduce database load
 * - Session tracking with automatic timeout
 * - Performance metrics collection
 * - Privacy-compliant data handling
 *
 * Based on: Google Analytics, Mixpanel, Segment architecture
 */

import { supabaseAdmin } from "../utils/supabase";
import logger from "../utils/logger";
import { incrementCounter, recordHistogram } from "../utils/monitoring";
import { UAParser } from "ua-parser-js";

// ============================================
// Type Definitions
// ============================================

export interface WidgetEvent {
  event_name: string;
  event_category?: "engagement" | "performance" | "error" | "system";
  properties?: Record<string, unknown>;
  page_url?: string;
  page_title?: string;
  client_timestamp?: string; // ISO 8601
}

export interface SessionContext {
  session_id: string;
  anonymous_id?: string;
  user_id?: string;
  user_email?: string;
  user_name?: string;
  user_metadata?: Record<string, unknown>;
}

export interface TrafficSource {
  referrer?: string;
  landing_page?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
}

export interface DeviceInfo {
  user_agent: string;
  screen_width?: number;
  screen_height?: number;
}

export interface SessionMetadata extends SessionContext, TrafficSource, DeviceInfo {
  ip_address?: string;
}

// ============================================
// Session Management
// ============================================

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes (industry standard)
const activeSessions = new Map<string, { lastActivity: number; chatbotId: string }>();

/**
 * Create or update a widget session
 */
export async function createOrUpdateSession(
  chatbotId: string,
  metadata: SessionMetadata
): Promise<{ session_id: string; is_new: boolean }> {
  const { session_id } = metadata;

  // Check if session is active (within timeout window)
  const existingSession = activeSessions.get(session_id);
  const now = Date.now();
  const isActive = existingSession && (now - existingSession.lastActivity) < SESSION_TIMEOUT_MS;

  if (isActive) {
    // Update last activity
    activeSessions.set(session_id, { lastActivity: now, chatbotId });
    return { session_id, is_new: false };
  }

  // Parse user agent
  const parser = new UAParser(metadata.user_agent);
  const browser = parser.getBrowser();
  const os = parser.getOS();
  const device = parser.getDevice();

  // Determine device type
  let deviceType = "desktop";
  if (device.type === "mobile") deviceType = "mobile";
  else if (device.type === "tablet") deviceType = "tablet";

  try {
    // Create new session (upsert to handle race conditions)
    const { data, error } = await supabaseAdmin
      .from("widget_sessions")
      .upsert({
        chatbot_id: chatbotId,
        session_id: session_id,
        anonymous_id: metadata.anonymous_id,
        user_id: metadata.user_id,
        user_email: metadata.user_email,
        user_name: metadata.user_name,
        user_metadata: metadata.user_metadata || {},
        referrer: metadata.referrer,
        landing_page: metadata.landing_page,
        utm_source: metadata.utm_source,
        utm_medium: metadata.utm_medium,
        utm_campaign: metadata.utm_campaign,
        utm_term: metadata.utm_term,
        utm_content: metadata.utm_content,
        user_agent: metadata.user_agent,
        browser_name: browser.name,
        browser_version: browser.version,
        os_name: os.name,
        os_version: os.version,
        device_type: deviceType,
        screen_width: metadata.screen_width,
        screen_height: metadata.screen_height,
        ip_address: metadata.ip_address,
        started_at: new Date().toISOString(),
      }, {
        onConflict: "session_id",
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) {
      logger.error("Failed to create widget session", { error, session_id, chatbotId });
      throw error;
    }

    // Track in memory
    activeSessions.set(session_id, { lastActivity: now, chatbotId });

    incrementCounter("widget.sessions.created", 1, { chatbot_id: chatbotId });

    return { session_id, is_new: true };
  } catch (error) {
    logger.error("Session creation error", { error, session_id });
    throw error;
  }
}

/**
 * End a session (called on widget unload or timeout)
 */
export async function endSession(session_id: string): Promise<void> {
  try {
    // Get session from database
    const { data: session, error: fetchError } = await supabaseAdmin
      .from("widget_sessions")
      .select("started_at, messages_sent, messages_received")
      .eq("session_id", session_id)
      .single();

    if (fetchError || !session) {
      logger.debug("Session not found for ending", { session_id });
      return;
    }

    const startedAt = new Date(session.started_at);
    const endedAt = new Date();
    const durationSeconds = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);

    // Update session with end time and duration
    const { error: updateError } = await supabaseAdmin
      .from("widget_sessions")
      .update({
        ended_at: endedAt.toISOString(),
        duration_seconds: durationSeconds,
        had_conversation: (session.messages_sent || 0) > 0,
      })
      .eq("session_id", session_id);

    if (updateError) {
      logger.error("Failed to end widget session", { error: updateError, session_id });
    }

    // Remove from active sessions
    activeSessions.delete(session_id);

    recordHistogram("widget.session.duration", durationSeconds);
  } catch (error) {
    logger.error("Session end error", { error, session_id });
  }
}

/**
 * Update session user identification (when user logs in)
 */
export async function identifySession(
  session_id: string,
  identity: {
    user_id?: string;
    user_email?: string;
    user_name?: string;
    user_metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from("widget_sessions")
      .update({
        user_id: identity.user_id,
        user_email: identity.user_email,
        user_name: identity.user_name,
        user_metadata: identity.user_metadata || {},
      })
      .eq("session_id", session_id);

    if (error) {
      logger.error("Failed to identify session", { error, session_id });
      throw error;
    }

    logger.debug("Session identified", { session_id, user_id: identity.user_id });
  } catch (error) {
    logger.error("Session identify error", { error, session_id });
    throw error;
  }
}

// ============================================
// Event Tracking
// ============================================

// Event batching (reduces database writes)
interface BatchedEvent extends WidgetEvent {
  chatbot_id: string;
  session_id: string;
  server_timestamp: Date;
}

const eventBatch: BatchedEvent[] = [];
const MAX_BATCH_SIZE = 100;
const BATCH_FLUSH_INTERVAL_MS = 5000; // 5 seconds

// Auto-flush batch periodically
setInterval(() => {
  if (eventBatch.length > 0) {
    flushEventBatch();
  }
}, BATCH_FLUSH_INTERVAL_MS);

/**
 * Track a widget event (batched for performance)
 */
export async function trackEvent(
  chatbotId: string,
  sessionId: string,
  event: WidgetEvent
): Promise<void> {
  // Add to batch
  eventBatch.push({
    chatbot_id: chatbotId,
    session_id: sessionId,
    server_timestamp: new Date(),
    ...event,
  });

  incrementCounter("widget.events.tracked", 1, {
    chatbot_id: chatbotId,
    event_name: event.event_name,
  });

  // Flush if batch is full
  if (eventBatch.length >= MAX_BATCH_SIZE) {
    await flushEventBatch();
  }
}

/**
 * Flush event batch to database
 */
async function flushEventBatch(): Promise<void> {
  if (eventBatch.length === 0) return;

  // Take current batch and clear
  const eventsToFlush = eventBatch.splice(0, eventBatch.length);

  try {
    const { error } = await supabaseAdmin
      .from("widget_events")
      .insert(
        eventsToFlush.map((event) => ({
          chatbot_id: event.chatbot_id,
          session_id: event.session_id,
          event_name: event.event_name,
          event_category: event.event_category,
          properties: event.properties || {},
          page_url: event.page_url,
          page_title: event.page_title,
          timestamp: event.server_timestamp.toISOString(),
          client_timestamp: event.client_timestamp,
        }))
      );

    if (error) {
      logger.error("Failed to flush event batch", { error, count: eventsToFlush.length });
      // Re-add failed events to batch (with limit to prevent infinite growth)
      if (eventBatch.length < MAX_BATCH_SIZE * 2) {
        eventBatch.push(...eventsToFlush);
      }
    } else {
      logger.debug("Flushed event batch", { count: eventsToFlush.length });
    }
  } catch (error) {
    logger.error("Event batch flush error", { error, count: eventsToFlush.length });
  }
}

/**
 * Track multiple events at once (bulk API)
 */
export async function trackEvents(
  chatbotId: string,
  sessionId: string,
  events: WidgetEvent[]
): Promise<void> {
  for (const event of events) {
    await trackEvent(chatbotId, sessionId, event);
  }
}

// ============================================
// Session Metrics Updates
// ============================================

/**
 * Increment session message counter
 */
export async function incrementSessionMessages(
  sessionId: string,
  type: "sent" | "received"
): Promise<void> {
  try {
    const column = type === "sent" ? "messages_sent" : "messages_received";

    const { error } = await supabaseAdmin.rpc("increment_session_messages", {
      p_session_id: sessionId,
      p_column: column,
    });

    if (error) {
      // Fallback: manual increment if RPC doesn't exist
      const { data: session } = await supabaseAdmin
        .from("widget_sessions")
        .select(column)
        .eq("session_id", sessionId)
        .single();

      if (session) {
        const currentValue = (session as Record<string, number>)[column] || 0;
        await supabaseAdmin
          .from("widget_sessions")
          .update({ [column]: currentValue + 1 })
          .eq("session_id", sessionId);
      }
    }

    // Update activity timestamp
    const activeSession = activeSessions.get(sessionId);
    if (activeSession) {
      activeSessions.set(sessionId, { ...activeSession, lastActivity: Date.now() });
    }
  } catch (error) {
    logger.error("Failed to increment session messages", { error, sessionId, type });
  }
}

/**
 * Update session widget interaction counts
 */
export async function incrementSessionInteraction(
  sessionId: string,
  type: "opened" | "minimized"
): Promise<void> {
  try {
    const column = type === "opened" ? "widget_opened_count" : "widget_minimized_count";

    const { data: session } = await supabaseAdmin
      .from("widget_sessions")
      .select(column)
      .eq("session_id", sessionId)
      .single();

    if (session) {
      const currentValue = (session as Record<string, number>)[column] || 0;
      await supabaseAdmin
        .from("widget_sessions")
        .update({ [column]: currentValue + 1 })
        .eq("session_id", sessionId);
    }
  } catch (error) {
    logger.error("Failed to increment session interaction", { error, sessionId, type });
  }
}

// ============================================
// Analytics Queries
// ============================================

/**
 * Get session summary for a chatbot
 */
export async function getSessionSummary(chatbotId: string, days = 30) {
  try {
    const { data, error } = await supabaseAdmin.rpc("get_widget_session_summary", {
      p_chatbot_id: chatbotId,
      p_days: days,
    });

    if (error) throw error;

    return data?.[0] || null;
  } catch (error) {
    logger.error("Failed to get session summary", { error, chatbotId });
    throw error;
  }
}

/**
 * Get daily trends
 */
export async function getDailyTrends(chatbotId: string, days = 30) {
  try {
    const { data, error } = await supabaseAdmin.rpc("get_widget_daily_trends", {
      p_chatbot_id: chatbotId,
      p_days: days,
    });

    if (error) throw error;

    return data || [];
  } catch (error) {
    logger.error("Failed to get daily trends", { error, chatbotId });
    throw error;
  }
}

/**
 * Get top events
 */
export async function getTopEvents(chatbotId: string, days = 7, limit = 10) {
  try {
    const { data, error } = await supabaseAdmin.rpc("get_widget_top_events", {
      p_chatbot_id: chatbotId,
      p_days: days,
      p_limit: limit,
    });

    if (error) throw error;

    return data || [];
  } catch (error) {
    logger.error("Failed to get top events", { error, chatbotId });
    throw error;
  }
}

/**
 * Get real-time active sessions count
 */
export async function getActiveSessions(chatbotId: string): Promise<number> {
  let count = 0;
  const now = Date.now();

  activeSessions.forEach((session) => {
    if (
      session.chatbotId === chatbotId &&
      now - session.lastActivity < SESSION_TIMEOUT_MS
    ) {
      count++;
    }
  });

  return count;
}

// ============================================
// Cleanup & Maintenance
// ============================================

/**
 * Clean up stale sessions from memory
 */
export function cleanupStaleSessions(): void {
  const now = Date.now();
  const staleSessionIds: string[] = [];

  activeSessions.forEach((session, sessionId) => {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      staleSessionIds.push(sessionId);
    }
  });

  staleSessionIds.forEach((sessionId) => {
    endSession(sessionId); // Async, fire and forget
    activeSessions.delete(sessionId);
  });

  if (staleSessionIds.length > 0) {
    logger.debug("Cleaned up stale sessions", { count: staleSessionIds.length });
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupStaleSessions, 5 * 60 * 1000);

// Flush events on process exit
process.on("beforeExit", async () => {
  await flushEventBatch();
});

export default {
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
};
