import { Queue, Worker, Job } from "bullmq";
import { redis } from "../utils/redis";
import { scrapeWebsite } from "../services/scraper";
import { embeddingService } from "../services/embedding";
import { supabaseAdmin } from "../utils/supabase";
import logger from "../utils/logger";

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
  } = {
    host: url.hostname,
    port: parseInt(url.port || "6379"),
    maxRetriesPerRequest: null, // Required for BullMQ workers
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

interface ScrapeJobData {
  chatbotId: string;
  websiteUrl: string;
  maxPages: number;
  historyId?: string; // For tracking re-scrape history
  isRescrape?: boolean; // Flag to indicate this is a re-scrape
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
    const { chatbotId, websiteUrl, maxPages, historyId, isRescrape } = job.data;

    logger.info("Starting scrape job", { chatbotId, websiteUrl, jobId: job.id, isRescrape });

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

      // Scrape website
      const pages = await scrapeWebsite(websiteUrl, maxPages);

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

      // Delete existing embeddings (if any from previous training)
      await embeddingService.deleteEmbeddings(chatbotId);

      // Create embeddings for each page
      let processed = 0;
      for (const page of pages) {
        await embeddingService.createEmbedding(chatbotId, page);
        processed++;

        // Update progress
        await job.updateProgress((processed / pages.length) * 100);
      }

      // Chatbot stays "ready" - no status change needed
      // Once embeddings exist, responses will automatically become more specific

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

      // Update chatbot's last_scraped_at timestamp
      await supabaseAdmin
        .from("chatbots")
        .update({
          last_scraped_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", chatbotId);

      logger.info("Embedding job completed - chatbot now fully trained", {
        chatbotId,
        pagesProcessed: pages.length,
        embeddingsCreated: embeddingCount,
        isRescrape,
      });

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
      const { data: chatbots, error } = await supabaseAdmin
        .from("chatbots")
        .select("id, website_url, scrape_frequency, last_scraped_at")
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

          // Queue the scraping job
          await scrapeQueue.add(
            "scrape-website",
            {
              chatbotId: chatbot.id,
              websiteUrl: chatbot.website_url,
              maxPages: 50,
              historyId: historyEntry.id,
              isRescrape: true,
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

// Event handlers for scheduled rescrape
scheduledRescrapeWorker.on("completed", (job) => {
  logger.info("Scheduled re-scrape job completed", { jobId: job.id, result: job.returnvalue });
});

scheduledRescrapeWorker.on("failed", (job, err) => {
  logger.error("Scheduled re-scrape job failed", { jobId: job?.id, error: err.message });
});

// Graceful shutdown
export async function closeQueues(): Promise<void> {
  await scrapeWorker.close();
  await embeddingWorker.close();
  await scheduledRescrapeWorker.close();
  await scrapeQueue.close();
  await embeddingQueue.close();
  await scheduledRescrapeQueue.close();
  logger.info("All queues closed");
}
