import { Queue, Worker, Job } from "bullmq";
import { redis } from "../utils/redis";
import { scrapeWebsite } from "../services/scraper";
import { embeddingService } from "../services/embedding";
import { supabaseAdmin } from "../utils/supabase";
import logger from "../utils/logger";

const connection = {
  host: new URL(process.env.REDIS_URL || "redis://localhost:6379").hostname,
  port: parseInt(new URL(process.env.REDIS_URL || "redis://localhost:6379").port || "6379"),
};

// Scraping Queue
export const scrapeQueue = new Queue("scrape", { connection });

// Embedding Queue
export const embeddingQueue = new Queue("embedding", { connection });

interface ScrapeJobData {
  chatbotId: string;
  websiteUrl: string;
  maxPages: number;
}

interface EmbeddingJobData {
  chatbotId: string;
  pages: { url: string; title: string; content: string }[];
}

// Scrape Worker
export const scrapeWorker = new Worker<ScrapeJobData>(
  "scrape",
  async (job: Job<ScrapeJobData>) => {
    const { chatbotId, websiteUrl, maxPages } = job.data;

    logger.info("Starting scrape job", { chatbotId, websiteUrl, jobId: job.id });

    try {
      // Update status to scraping
      await supabaseAdmin
        .from("chatbots")
        .update({ status: "scraping" })
        .eq("id", chatbotId);

      // Scrape website
      const pages = await scrapeWebsite(websiteUrl, maxPages);

      if (pages.length === 0) {
        throw new Error("No pages scraped from website");
      }

      logger.info("Scraping completed", { chatbotId, pagesScraped: pages.length });

      // Queue embedding job
      await embeddingQueue.add(
        "create-embeddings",
        { chatbotId, pages },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 10000 },
        }
      );

      return { pagesScraped: pages.length };
    } catch (error) {
      logger.error("Scrape job failed", { chatbotId, error });

      // Update status to failed
      await supabaseAdmin
        .from("chatbots")
        .update({ status: "failed" })
        .eq("id", chatbotId);

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
    const { chatbotId, pages } = job.data;

    logger.info("Starting embedding job", { chatbotId, pageCount: pages.length, jobId: job.id });

    try {
      // Update status to embedding
      await supabaseAdmin
        .from("chatbots")
        .update({ status: "embedding" })
        .eq("id", chatbotId);

      // Delete existing embeddings
      await embeddingService.deleteEmbeddings(chatbotId);

      // Create embeddings for each page
      let processed = 0;
      for (const page of pages) {
        await embeddingService.createEmbedding(chatbotId, page);
        processed++;

        // Update progress
        await job.updateProgress((processed / pages.length) * 100);
      }

      // Update status to ready
      await supabaseAdmin
        .from("chatbots")
        .update({ status: "ready" })
        .eq("id", chatbotId);

      const embeddingCount = await embeddingService.getEmbeddingCount(chatbotId);

      logger.info("Embedding job completed", {
        chatbotId,
        pagesProcessed: pages.length,
        embeddingsCreated: embeddingCount,
      });

      return { embeddingsCreated: embeddingCount };
    } catch (error) {
      logger.error("Embedding job failed", { chatbotId, error });

      // Update status to failed
      await supabaseAdmin
        .from("chatbots")
        .update({ status: "failed" })
        .eq("id", chatbotId);

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

// Graceful shutdown
export async function closeQueues(): Promise<void> {
  await scrapeWorker.close();
  await embeddingWorker.close();
  await scrapeQueue.close();
  await embeddingQueue.close();
  logger.info("All queues closed");
}
