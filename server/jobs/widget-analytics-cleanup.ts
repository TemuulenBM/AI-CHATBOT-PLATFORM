/**
 * Widget Analytics Data Retention & Cleanup Job
 *
 * Manages data lifecycle according to retention policies:
 * - Raw events: 90 days retention
 * - Sessions: 1 year retention
 * - Daily stats: Indefinite (aggregate data)
 *
 * Runs daily via BullMQ scheduler
 */

import { Queue, Worker, Job } from "bullmq";
import { supabaseAdmin } from "../utils/supabase";
import logger from "../utils/logger";
import { redis } from "../utils/redis";
import { alertWarning, alertInfo } from "../utils/monitoring";

// ============================================
// Queue Setup
// ============================================

// Lazy initialization to avoid connection issues
let analyticsCleanupQueue: Queue | null = null;
let analyticsCleanupWorker: Worker | null = null;

function getQueue(): Queue {
  if (!analyticsCleanupQueue) {
    analyticsCleanupQueue = new Queue("analytics-cleanup", {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 60000, // 1 minute
        },
        removeOnComplete: {
          age: 86400, // Keep completed jobs for 24 hours
          count: 100,
        },
        removeOnFail: {
          age: 604800, // Keep failed jobs for 7 days
          count: 1000,
        },
      },
    });
  }
  return analyticsCleanupQueue;
}

export { getQueue as analyticsCleanupQueue };

// ============================================
// Data Retention Configuration
// ============================================

const RETENTION_POLICIES = {
  events: 90, // days - raw event stream
  sessions: 365, // days - session summaries
  daily_stats: null, // null = indefinite retention
};

// ============================================
// Cleanup Functions
// ============================================

/**
 * Delete old widget events (90 days)
 */
async function cleanupOldEvents(): Promise<{ deleted: number }> {
  const retentionDate = new Date();
  retentionDate.setDate(retentionDate.getDate() - RETENTION_POLICIES.events);

  logger.info("Cleaning up old widget events", {
    retention_days: RETENTION_POLICIES.events,
    cutoff_date: retentionDate.toISOString(),
  });

  try {
    // Delete in batches to avoid long-running transactions
    let totalDeleted = 0;
    const batchSize = 10000;

    while (true) {
      const { data: eventsToDelete, error: selectError } = await supabaseAdmin
        .from("widget_events")
        .select("id")
        .lt("created_at", retentionDate.toISOString())
        .limit(batchSize);

      if (selectError) {
        throw selectError;
      }

      if (!eventsToDelete || eventsToDelete.length === 0) {
        break;
      }

      const ids = eventsToDelete.map((e) => e.id);

      const { error: deleteError } = await supabaseAdmin
        .from("widget_events")
        .delete()
        .in("id", ids);

      if (deleteError) {
        throw deleteError;
      }

      totalDeleted += eventsToDelete.length;

      logger.info("Deleted batch of widget events", {
        batch_size: eventsToDelete.length,
        total_deleted: totalDeleted,
      });

      // If we got fewer than batch size, we're done
      if (eventsToDelete.length < batchSize) {
        break;
      }

      // Small delay between batches to reduce database load
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    logger.info("Completed widget events cleanup", { total_deleted: totalDeleted });

    return { deleted: totalDeleted };
  } catch (error) {
    logger.error("Failed to cleanup widget events", { error });
    throw error;
  }
}

/**
 * Delete old widget sessions (1 year)
 */
async function cleanupOldSessions(): Promise<{ deleted: number }> {
  const retentionDate = new Date();
  retentionDate.setDate(retentionDate.getDate() - RETENTION_POLICIES.sessions);

  logger.info("Cleaning up old widget sessions", {
    retention_days: RETENTION_POLICIES.sessions,
    cutoff_date: retentionDate.toISOString(),
  });

  try {
    // Delete in batches
    let totalDeleted = 0;
    const batchSize = 5000;

    while (true) {
      const { data: sessionsToDelete, error: selectError } = await supabaseAdmin
        .from("widget_sessions")
        .select("id")
        .lt("created_at", retentionDate.toISOString())
        .limit(batchSize);

      if (selectError) {
        throw selectError;
      }

      if (!sessionsToDelete || sessionsToDelete.length === 0) {
        break;
      }

      const ids = sessionsToDelete.map((s) => s.id);

      const { error: deleteError } = await supabaseAdmin
        .from("widget_sessions")
        .delete()
        .in("id", ids);

      if (deleteError) {
        throw deleteError;
      }

      totalDeleted += sessionsToDelete.length;

      logger.info("Deleted batch of widget sessions", {
        batch_size: sessionsToDelete.length,
        total_deleted: totalDeleted,
      });

      if (sessionsToDelete.length < batchSize) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    logger.info("Completed widget sessions cleanup", { total_deleted: totalDeleted });

    return { deleted: totalDeleted };
  } catch (error) {
    logger.error("Failed to cleanup widget sessions", { error });
    throw error;
  }
}

/**
 * Generate/update daily statistics rollups
 * This pre-aggregates data for fast dashboard queries
 */
async function generateDailyStats(): Promise<{ processed: number }> {
  logger.info("Generating daily analytics rollups");

  try {
    // Get yesterday's date (we don't process today as data is still coming in)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const tomorrow = new Date(yesterday);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all chatbots with sessions yesterday
    const { data: chatbots, error: chatbotError } = await supabaseAdmin
      .from("widget_sessions")
      .select("chatbot_id")
      .gte("started_at", yesterday.toISOString())
      .lt("started_at", tomorrow.toISOString());

    if (chatbotError) {
      throw chatbotError;
    }

    const uniqueChatbotIds = Array.from(new Set(chatbots?.map((c) => c.chatbot_id) || []));

    logger.info(`Generating stats for ${uniqueChatbotIds.length} chatbots`);

    for (const chatbotId of uniqueChatbotIds) {
      await generateDailyStatsForChatbot(chatbotId, yesterday);
    }

    return { processed: uniqueChatbotIds.length };
  } catch (error) {
    logger.error("Failed to generate daily stats", { error });
    throw error;
  }
}

/**
 * Generate daily stats for a specific chatbot
 */
async function generateDailyStatsForChatbot(
  chatbotId: string,
  date: Date
): Promise<void> {
  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Get all sessions for this chatbot on this date
  const { data: sessions, error: sessionError } = await supabaseAdmin
    .from("widget_sessions")
    .select("*")
    .eq("chatbot_id", chatbotId)
    .gte("started_at", date.toISOString())
    .lt("started_at", tomorrow.toISOString());

  if (sessionError || !sessions) {
    logger.error("Failed to fetch sessions for daily stats", { error: sessionError, chatbotId });
    return;
  }

  // Calculate aggregate metrics
  const totalSessions = sessions.length;
  const uniqueVisitors = new Set(sessions.map((s) => s.anonymous_id).filter(Boolean)).size;
  const totalConversations = sessions.filter((s) => s.had_conversation).length;
  const totalMessagesSent = sessions.reduce((sum, s) => sum + (s.messages_sent || 0), 0);
  const totalMessagesReceived = sessions.reduce((sum, s) => sum + (s.messages_received || 0), 0);
  const avgMessagesPerSession =
    totalSessions > 0 ? (totalMessagesSent + totalMessagesReceived) / totalSessions : 0;

  const sessionsWithDuration = sessions.filter((s) => s.duration_seconds != null);
  const avgSessionDuration =
    sessionsWithDuration.length > 0
      ? sessionsWithDuration.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) /
        sessionsWithDuration.length
      : 0;

  const widgetLoads = sessions.length; // Each session = 1 load
  const widgetOpens = sessions.reduce((sum, s) => sum + (s.widget_opened_count || 0), 0);
  const conversionRate = totalSessions > 0 ? (totalConversations / totalSessions) * 100 : 0;

  // Device breakdown
  const desktopSessions = sessions.filter((s) => s.device_type === "desktop").length;
  const mobileSessions = sessions.filter((s) => s.device_type === "mobile").length;
  const tabletSessions = sessions.filter((s) => s.device_type === "tablet").length;

  // Upsert daily stats (replace if exists for this date)
  const { error: upsertError } = await supabaseAdmin.from("widget_daily_stats").upsert(
    {
      chatbot_id: chatbotId,
      stat_date: date.toISOString().split("T")[0], // YYYY-MM-DD
      total_sessions: totalSessions,
      unique_visitors: uniqueVisitors,
      total_conversations: totalConversations,
      total_messages_sent: totalMessagesSent,
      total_messages_received: totalMessagesReceived,
      avg_messages_per_session: Math.round(avgMessagesPerSession * 100) / 100,
      avg_session_duration_seconds: Math.round(avgSessionDuration),
      widget_loads: widgetLoads,
      widget_opens: widgetOpens,
      conversion_rate: Math.round(conversionRate * 100) / 100,
      desktop_sessions: desktopSessions,
      mobile_sessions: mobileSessions,
      tablet_sessions: tabletSessions,
    },
    {
      onConflict: "chatbot_id,stat_date",
    }
  );

  if (upsertError) {
    logger.error("Failed to upsert daily stats", { error: upsertError, chatbotId, date });
  } else {
    logger.debug("Generated daily stats", { chatbotId, date, totalSessions });
  }
}

// ============================================
// Worker Setup
// ============================================

/**
 * Get or create worker instance
 */
function getWorker(): Worker {
  if (!analyticsCleanupWorker) {
    analyticsCleanupWorker = new Worker(
      "analytics-cleanup",
      async (job: Job) => {
        logger.info("Starting analytics cleanup job", { job_id: job.id });

        const results = {
          events_deleted: 0,
          sessions_deleted: 0,
          stats_generated: 0,
        };

        try {
          // Step 1: Delete old events
          const eventResult = await cleanupOldEvents();
          results.events_deleted = eventResult.deleted;

          if (eventResult.deleted > 0) {
            alertInfo(
              "analytics_cleanup",
              `Deleted ${eventResult.deleted} old widget events (${RETENTION_POLICIES.events}d retention)`
            );
          }

          // Step 2: Delete old sessions
          const sessionResult = await cleanupOldSessions();
          results.sessions_deleted = sessionResult.deleted;

          if (sessionResult.deleted > 0) {
            alertInfo(
              "analytics_cleanup",
              `Deleted ${sessionResult.deleted} old widget sessions (${RETENTION_POLICIES.sessions}d retention)`
            );
          }

          // Step 3: Generate daily stats rollups
          const statsResult = await generateDailyStats();
          results.stats_generated = statsResult.processed;

          logger.info("Analytics cleanup job completed", results);

          return results;
        } catch (error) {
          logger.error("Analytics cleanup job failed", { error, results });
          alertWarning("analytics_cleanup_failed", "Analytics cleanup job encountered errors", {
            error: error instanceof Error ? error.message : String(error),
            results,
          });
          throw error;
        }
      },
      {
        connection: redis,
        concurrency: 1, // Only one cleanup job at a time
      }
    );

    // Worker event handlers
    analyticsCleanupWorker.on("completed", (job) => {
      logger.info("Analytics cleanup job completed", {
        job_id: job.id,
        duration_ms: job.finishedOn ? job.finishedOn - (job.processedOn || job.finishedOn) : null,
      });
    });

    analyticsCleanupWorker.on("failed", (job, err) => {
      logger.error("Analytics cleanup job failed", {
        job_id: job?.id,
        error: err.message,
      });
    });
  }
  return analyticsCleanupWorker;
}

export { getWorker as analyticsCleanupWorker };

// ============================================
// Scheduler
// ============================================

/**
 * Schedule daily cleanup job
 * Runs every day at 2 AM UTC
 */
export async function scheduleAnalyticsCleanup(): Promise<void> {
  try {
    const queue = getQueue();
    const worker = getWorker(); // Initialize worker

    // Remove existing repeatable jobs
    const repeatableJobs = await queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await queue.removeRepeatableByKey(job.key);
    }

    // Schedule daily at 2 AM UTC
    await queue.add(
      "daily-cleanup",
      {},
      {
        repeat: {
          pattern: "0 2 * * *", // Cron: 2 AM every day
        },
      }
    );

    logger.info("Analytics cleanup job scheduled (daily at 2 AM UTC)");
  } catch (error) {
    logger.error("Failed to schedule analytics cleanup", { error });
    throw error;
  }
}

// ============================================
// Manual Trigger (for testing/emergency)
// ============================================

/**
 * Manually trigger cleanup job
 */
export async function triggerCleanup(): Promise<Job> {
  logger.info("Manually triggering analytics cleanup");
  const queue = getQueue();
  return await queue.add("manual-cleanup", {});
}

export default {
  queue: getQueue,
  worker: getWorker,
  scheduleAnalyticsCleanup,
  triggerCleanup,
};
