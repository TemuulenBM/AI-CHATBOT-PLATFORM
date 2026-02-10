import { Queue, Worker, Job } from "bullmq";
import { redis } from "../utils/redis";
import { scrapeWebsite } from "../services/scraper";
import { embeddingService } from "../services/embedding";
import { supabaseAdmin, getUserPlanLimits } from "../utils/supabase";
import logger from "../utils/logger";
import EmailService from "../services/email";
import { alertCritical, incrementCounter } from "../utils/monitoring";

// Parse Redis URL for BullMQ connection (supports Upstash with TLS)
function getRedisConnection() {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const url = new URL(redisUrl);

  const connection: {
    host: string;
    port: number;
    password?: string;
    tls?: { rejectUnauthorized: boolean };
    maxRetriesPerRequest: null;
    retryStrategy?: (times: number) => number | void;
  } = {
    host: url.hostname,
    port: parseInt(url.port || "6379"),
    maxRetriesPerRequest: null, // Required for BullMQ workers
    retryStrategy(times: number) {
      // Reduce retry attempts when quota is exceeded
      if (times > 3) {
        logger.debug("Redis retry limit reached for BullMQ - pausing retries");
        return undefined; // Stop retrying
      }
      return Math.min(times * 100, 2000);
    },
  };

  // Extract password from URL (format: rediss://default:PASSWORD@host:port)
  if (url.password) {
    connection.password = url.password;
  }

  // Enable TLS for rediss:// URLs (Upstash requires TLS)
  if (url.protocol === "rediss:") {
    connection.tls = { rejectUnauthorized: false };
  }

  return connection;
}

const connection = getRedisConnection();

// Scraping Queue
export const scrapeQueue = new Queue("scrape", { connection });

// Embedding Queue
export const embeddingQueue = new Queue("embedding", { connection });

// Handle queue errors with proper alerting
const handleQueueError = async (err: Error, queueName: string) => {
  if (err.message && err.message.includes("max requests limit exceeded")) {
    // Send critical alert with rate-limiting built-in (60s cooldown)
    alertCritical(
      "redis_connection_lost",
      "Redis quota limit exceeded - job queues degraded",
      {
        queueName,
        error: err.message,
        timestamp: new Date().toISOString(),
        impact: "Background jobs (scraping, embeddings) may fail",
        action: "Check Upstash quota and upgrade if needed",
      }
    );

    // Track metric for monitoring dashboard
    incrementCounter("redis.quota_exceeded", 1);

    // Send admin email (rate limited - once per hour per queue)
    const emailCacheKey = `queue_error_email:${queueName}`;
    try {
      const lastSent = await redis.get(emailCacheKey).catch(() => null);

      if (!lastSent) {
        const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM;
        if (adminEmail) {
          await EmailService.sendAdminAlert(
            adminEmail,
            `Queue Error: ${queueName}`,
            "Redis quota exceeded affecting job queues",
            {
              queueName,
              error: err.message,
              impact: "Background jobs (scraping, embeddings) may fail",
              action: "Check Upstash Redis quota and upgrade plan if needed",
            }
          );
          await redis.setex(emailCacheKey, 3600, Date.now().toString()).catch(() => {});
          logger.info("Admin email sent for queue error", { queueName, adminEmail });
        } else {
          logger.warn("ADMIN_EMAIL not configured, skipping queue error notification");
        }
      }
    } catch (emailError) {
      logger.error("Failed to send queue error email", { error: emailError, queueName });
    }

    // Gracefully degrade - don't crash the queue
    return;
  }

  // Other errors
  logger.error("Queue error", { queueName, error: err.message });
};

scrapeQueue.on("error", (err) => handleQueueError(err, "scrapeQueue"));
embeddingQueue.on("error", (err) => handleQueueError(err, "embeddingQueue"));

interface ScrapeJobData {
  chatbotId: string;
  websiteUrl: string;
  maxPages: number;
  historyId?: string; // For tracking re-scrape history
  isRescrape?: boolean; // Flag to indicate this is a re-scrape
  renderJavaScript?: boolean; // SPA сайтуудын JavaScript-г Puppeteer-ээр render хийх
}

interface EmbeddingJobData {
  chatbotId: string;
  pages: { url: string; title: string; content: string }[];
  historyId?: string; // For tracking re-scrape history
  isRescrape?: boolean;
}

// Scrape Worker
export const scrapeWorker = new Worker<ScrapeJobData>(
  "scrape",
  async (job: Job<ScrapeJobData>) => {
    const { chatbotId, websiteUrl, maxPages, historyId, isRescrape, renderJavaScript } = job.data;

    logger.info("Starting scrape job", { chatbotId, websiteUrl, jobId: job.id, isRescrape, renderJavaScript });

    // Update scrape history status to in_progress if this is a tracked rescrape
    if (historyId) {
      await supabaseAdmin
        .from("scrape_history")
        .update({ status: "in_progress" })
        .eq("id", historyId);
    }

    try {
      // Chatbot remains "ready" - it's already live and serving requests
      // No status update needed - chatbot stays ready during training

      // Scrape website — renderJavaScript: true бол Puppeteer ашиглан SPA content авна
      const pages = await scrapeWebsite(websiteUrl, maxPages, { renderJavaScript });

      if (pages.length === 0) {
        throw new Error("No pages scraped from website");
      }

      logger.info("Scraping completed", { chatbotId, pagesScraped: pages.length, isRescrape });

      // Update scrape history with pages count
      if (historyId) {
        await supabaseAdmin
          .from("scrape_history")
          .update({ pages_scraped: pages.length })
          .eq("id", historyId);
      }

      // Queue embedding job
      await embeddingQueue.add(
        "create-embeddings",
        { chatbotId, pages, historyId, isRescrape },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 10000 },
        }
      );

      return { pagesScraped: pages.length };
    } catch (error) {
      logger.error("Scrape job failed", { chatbotId, error, isRescrape });

      // Update scrape history with failure status
      if (historyId) {
        await supabaseAdmin
          .from("scrape_history")
          .update({
            status: "failed",
            error_message: error instanceof Error ? error.message : "Unknown error",
            completed_at: new Date().toISOString(),
          })
          .eq("id", historyId);
      }

      // Keep chatbot ready even if scraping fails - it will use fallback mode
      // Only log the error, don't mark as failed
      logger.warn("Chatbot will continue operating in fallback mode", { chatbotId });

      throw error;
    }
  },
  {
    connection,
    concurrency: 2,
    // Scraping удаан процесс (Chrome суулгах + олон page scrape хийх) тул lock хугацааг уртасгана.
    // Default 30s нь хангалтгүй — Chrome install ~60s, scraping ~минутууд зарцуулж болно.
    // lockRenewTime автоматаар lockDuration / 2 = 60s болно.
    lockDuration: 120_000,
    limiter: {
      max: 5,
      duration: 60000, // 5 jobs per minute
    },
  }
);

// Embedding Worker
export const embeddingWorker = new Worker<EmbeddingJobData>(
  "embedding",
  async (job: Job<EmbeddingJobData>) => {
    const { chatbotId, pages, historyId, isRescrape } = job.data;

    logger.info("Starting embedding job", { chatbotId, pageCount: pages.length, jobId: job.id, isRescrape });

    try {
      // Chatbot remains "ready" throughout embedding process
      // It's already serving requests in fallback mode

      // Swap pattern: эхлээд шинийг үүсгэж, дараа нь хуучныг устгана
      // Яагаад: delete → create дарааллаар хийвэл, create fail болоход бүх embedding алдагдана
      // Swap pattern-д create fail болсон ч хуучин embedding хэвээр үлдэнэ
      const cutoffTime = new Date().toISOString();

      // Шинэ embedding-уудыг үүсгэх (хуучинтай зэрэг оршино — similarity search ажиллана)
      let processed = 0;
      for (const page of pages) {
        await embeddingService.createEmbedding(chatbotId, page);
        processed++;

        // Update progress
        await job.updateProgress((processed / pages.length) * 100);
      }

      // Бүх шинэ embedding амжилттай үүссэн — одоо хуучныг устгах аюулгүй
      await embeddingService.deleteEmbeddingsBefore(chatbotId, cutoffTime);

      const embeddingCount = await embeddingService.getEmbeddingCount(chatbotId);

      // Update scrape history with completion status
      if (historyId) {
        await supabaseAdmin
          .from("scrape_history")
          .update({
            status: "completed",
            embeddings_created: embeddingCount,
            completed_at: new Date().toISOString(),
          })
          .eq("id", historyId);
      }

      // Chatbot-ийн scrape мэдээллийг шинэчлэх
      // pages_scraped-г энд хадгална — UI-д зөв тоо харуулахын тулд
      await supabaseAdmin
        .from("chatbots")
        .update({
          last_scraped_at: new Date().toISOString(),
          pages_scraped: pages.length,
          updated_at: new Date().toISOString(),
        })
        .eq("id", chatbotId);

      logger.info("Embedding job completed - chatbot now fully trained", {
        chatbotId,
        pagesProcessed: pages.length,
        embeddingsCreated: embeddingCount,
        isRescrape,
      });

      // Send training complete email to the chatbot owner
      const { data: chatbot } = await supabaseAdmin
        .from("chatbots")
        .select("name, user_id, users!inner(email)")
        .eq("id", chatbotId)
        .single();

      if (chatbot && chatbot.users) {
        const users = chatbot.users as { email?: string };
        const userEmail = users.email;
        if (userEmail) {
          await EmailService.sendTrainingCompleteEmail(
            userEmail,
            chatbot.name,
            embeddingCount
          );
          logger.info("Training complete email sent", { chatbotId, email: userEmail });
        }
      }

      return { embeddingsCreated: embeddingCount };
    } catch (error) {
      logger.error("Embedding job failed", { chatbotId, error, isRescrape });

      // Update scrape history with failure status
      if (historyId) {
        await supabaseAdmin
          .from("scrape_history")
          .update({
            status: "failed",
            error_message: error instanceof Error ? error.message : "Unknown error",
            completed_at: new Date().toISOString(),
          })
          .eq("id", historyId);
      }

      // Keep chatbot ready even if embedding fails
      // It will continue operating in fallback mode
      logger.warn("Chatbot will continue operating in fallback mode", { chatbotId });

      throw error;
    }
  },
  {
    connection,
    concurrency: 1, // Process one at a time due to API rate limits
    limiter: {
      max: 10,
      duration: 60000, // 10 jobs per minute
    },
  }
);

// Error handlers for workers
const handleWorkerError = (err: Error, workerName: string) => {
  if (err.message && err.message.includes("max requests limit exceeded")) {
    // Send critical alert with rate-limiting built-in (60s cooldown)
    alertCritical(
      "redis_connection_lost",
      "Redis quota limit exceeded - workers degraded",
      {
        workerName,
        error: err.message,
        timestamp: new Date().toISOString(),
        impact: "Background workers (scraping, embeddings) may fail",
        action: "Check Upstash quota and upgrade if needed",
      }
    );

    // Track metric for monitoring dashboard
    incrementCounter("redis.quota_exceeded", 1);

    // Gracefully degrade - don't crash the worker
    return;
  }

  logger.error("Worker error", { workerName, error: err.message });
};

scrapeWorker.on("error", (err) => handleWorkerError(err, "scrapeWorker"));
embeddingWorker.on("error", (err) => handleWorkerError(err, "embeddingWorker"));

// Event handlers
scrapeWorker.on("completed", (job) => {
  logger.info("Scrape job completed", { jobId: job.id, result: job.returnvalue });
});

scrapeWorker.on("failed", (job, err) => {
  logger.error("Scrape job failed", { jobId: job?.id, error: err.message });
});

embeddingWorker.on("completed", (job) => {
  logger.info("Embedding job completed", { jobId: job.id, result: job.returnvalue });
});

embeddingWorker.on("failed", (job, err) => {
  logger.error("Embedding job failed", { jobId: job?.id, error: err.message });
});

// Scheduled Re-scraping Queue
export const scheduledRescrapeQueue = new Queue("scheduled-rescrape", { connection });

scheduledRescrapeQueue.on("error", (err) => handleQueueError(err, "scheduledRescrapeQueue"));

// GDPR Data Export Queue
export const dataExportQueue = new Queue("data-export", { connection });

dataExportQueue.on("error", (err) => handleQueueError(err, "dataExportQueue"));

// GDPR Account Deletion Queue
export const accountDeletionQueue = new Queue("account-deletion", { connection });

accountDeletionQueue.on("error", (err) => handleQueueError(err, "accountDeletionQueue"));

interface ScheduledRescrapeJobData {
  // Empty data - job fetches chatbots that need re-scraping
}

// Scheduled Re-scrape Worker - runs daily at 2 AM to check for chatbots needing re-scraping
export const scheduledRescrapeWorker = new Worker<ScheduledRescrapeJobData>(
  "scheduled-rescrape",
  async (job: Job<ScheduledRescrapeJobData>) => {
    logger.info("Starting scheduled re-scrape check", { jobId: job.id });

    try {
      // Get all chatbots with auto-scrape enabled that need re-scraping
      // settings-г авч renderJavaScript тохиргоо дамжуулна
      const { data: chatbots, error } = await supabaseAdmin
        .from("chatbots")
        .select("id, website_url, user_id, scrape_frequency, last_scraped_at, settings")
        .eq("auto_scrape_enabled", true)
        .neq("scrape_frequency", "manual");

      if (error) {
        logger.error("Failed to fetch chatbots for scheduled rescrape", { error });
        return { processed: 0 };
      }

      if (!chatbots || chatbots.length === 0) {
        logger.info("No chatbots with auto-scrape enabled");
        return { processed: 0 };
      }

      const now = new Date();
      let queuedCount = 0;

      for (const chatbot of chatbots) {
        const needsRescrape = shouldRescrape(chatbot.last_scraped_at, chatbot.scrape_frequency);

        if (needsRescrape) {
          // Get user's plan limits
          const { limits } = await getUserPlanLimits(chatbot.user_id);

          // Create scrape history entry
          const { data: historyEntry, error: historyError } = await supabaseAdmin
            .from("scrape_history")
            .insert({
              chatbot_id: chatbot.id,
              status: "pending",
              triggered_by: "scheduled",
              started_at: now.toISOString(),
            })
            .select()
            .single();

          if (historyError) {
            logger.error("Failed to create scrape history for scheduled rescrape", {
              error: historyError,
              chatbotId: chatbot.id,
            });
            continue;
          }

          // Chatbot settings-аас renderJavaScript тохиргоо авна
          const settings = chatbot.settings as Record<string, unknown> | null;

          // Queue the scraping job with plan-based page limit
          await scrapeQueue.add(
            "scrape-website",
            {
              chatbotId: chatbot.id,
              websiteUrl: chatbot.website_url,
              maxPages: limits.pages_per_crawl,
              historyId: historyEntry.id,
              isRescrape: true,
              renderJavaScript: !!settings?.renderJavaScript,
            },
            {
              attempts: 3,
              backoff: { type: "exponential", delay: 5000 },
            }
          );

          queuedCount++;
          logger.info("Scheduled re-scrape job queued", {
            chatbotId: chatbot.id,
            frequency: chatbot.scrape_frequency,
            maxPages: limits.pages_per_crawl,
          });
        }
      }

      logger.info("Scheduled re-scrape check completed", {
        totalChatbots: chatbots.length,
        queuedForRescrape: queuedCount,
      });

      return { processed: queuedCount };
    } catch (error) {
      logger.error("Scheduled re-scrape job failed", { error });
      throw error;
    }
  },
  {
    connection,
    concurrency: 1,
  }
);

// Helper function to determine if a chatbot needs re-scraping
function shouldRescrape(lastScrapedAt: string | null, frequency: string): boolean {
  if (!lastScrapedAt) {
    // Never scraped, needs scraping
    return true;
  }

  const lastScraped = new Date(lastScrapedAt);
  const now = new Date();
  const hoursSinceLastScrape = (now.getTime() - lastScraped.getTime()) / (1000 * 60 * 60);

  switch (frequency) {
    case "daily":
      return hoursSinceLastScrape >= 24;
    case "weekly":
      return hoursSinceLastScrape >= 24 * 7;
    case "monthly":
      return hoursSinceLastScrape >= 24 * 30;
    default:
      return false;
  }
}

// Initialize the scheduled re-scrape cron job (runs daily at 2 AM)
export async function initScheduledRescrape(): Promise<void> {
  // Remove any existing repeatable jobs to avoid duplicates
  const existingJobs = await scheduledRescrapeQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    await scheduledRescrapeQueue.removeRepeatableByKey(job.key);
  }

  // Add the repeatable job
  await scheduledRescrapeQueue.add(
    "check-scheduled-rescrapes",
    {},
    {
      repeat: {
        pattern: "0 2 * * *", // 2 AM daily
      },
    }
  );

  logger.info("Scheduled re-scrape cron job initialized (runs daily at 2 AM)");
}

// Error handler for scheduled rescrape worker
scheduledRescrapeWorker.on("error", (err) => handleWorkerError(err, "scheduledRescrapeWorker"));

// Event handlers for scheduled rescrape
scheduledRescrapeWorker.on("completed", (job) => {
  logger.info("Scheduled re-scrape job completed", { jobId: job.id, result: job.returnvalue });
});

scheduledRescrapeWorker.on("failed", (job, err) => {
  logger.error("Scheduled re-scrape job failed", { jobId: job?.id, error: err.message });
});

// Import GDPR workers (they self-register)
import './data-export-processor';
import './account-deletion-processor';
import { scheduledDeletionQueue, scheduledDeletionWorker, initScheduledDeletion } from './deletion-scheduler';

// Import Analytics Cleanup
import { analyticsCleanupQueue, analyticsCleanupWorker, scheduleAnalyticsCleanup } from './widget-analytics-cleanup';

// Export scheduler init functions
export { initScheduledDeletion, scheduleAnalyticsCleanup };

// Export analytics cleanup queue for admin controller
export { analyticsCleanupQueue };

// Export getRedisConnection for use by other job files
export { getRedisConnection };

// Graceful shutdown
export async function closeQueues(): Promise<void> {
  await scrapeWorker.close();
  await embeddingWorker.close();
  await scheduledRescrapeWorker.close();
  await scheduledDeletionWorker.close();
  await analyticsCleanupWorker.close();
  await scrapeQueue.close();
  await embeddingQueue.close();
  await scheduledRescrapeQueue.close();
  await dataExportQueue.close();
  await accountDeletionQueue.close();
  await scheduledDeletionQueue.close();
  await analyticsCleanupQueue.close();
  logger.info("All queues closed");
}
