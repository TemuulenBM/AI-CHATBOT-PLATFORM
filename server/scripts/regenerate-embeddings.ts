/**
 * Regenerate Embeddings Script
 *
 * This script re-generates embeddings for all chatbots after migration 005.
 * Migration 005 drops and recreates the embedding column, requiring all
 * embeddings to be regenerated.
 *
 * Usage:
 *   npm run tsx server/scripts/regenerate-embeddings.ts
 *
 * Options:
 *   --chatbot-id=<uuid>  Regenerate only for specific chatbot
 *   --batch-size=<num>   Number of embeddings to process in parallel (default: 10)
 *   --dry-run           Show what would be done without making changes
 */

import { supabaseAdmin } from "../utils/supabase";
import { EmbeddingService } from "../services/embedding";
import logger from "../utils/logger";

const embeddingService = new EmbeddingService();

interface RegenerateOptions {
  chatbotId?: string;
  batchSize?: number;
  dryRun?: boolean;
}

async function regenerateAllEmbeddings(options: RegenerateOptions = {}) {
  const { chatbotId, batchSize = 10, dryRun = false } = options;

  logger.info("Starting embedding regeneration", {
    chatbotId,
    batchSize,
    dryRun,
  });

  try {
    // Get chatbots to process
    let query = supabaseAdmin
      .from("chatbots")
      .select("id, name, user_id")
      .eq("status", "ready");

    if (chatbotId) {
      query = query.eq("id", chatbotId);
    }

    const { data: chatbots, error: chatbotsError } = await query;

    if (chatbotsError) {
      logger.error("Failed to fetch chatbots", { error: chatbotsError });
      throw chatbotsError;
    }

    if (!chatbots || chatbots.length === 0) {
      logger.warn("No chatbots found to process");
      return;
    }

    logger.info(`Found ${chatbots.length} chatbot(s) to process`);

    let totalProcessed = 0;
    let totalFailed = 0;

    for (const chatbot of chatbots) {
      logger.info(`Processing chatbot: ${chatbot.name} (${chatbot.id})`);

      try {
        // Set status to 'embedding' if not dry run
        if (!dryRun) {
          await supabaseAdmin
            .from("chatbots")
            .update({ status: "embedding" })
            .eq("id", chatbot.id);
        }

        // Get all embeddings for this chatbot
        const { data: embeddings, error: embeddingsError } = await supabaseAdmin
          .from("embeddings")
          .select("id, content, page_url")
          .eq("chatbot_id", chatbot.id);

        if (embeddingsError) {
          logger.error(`Failed to fetch embeddings for ${chatbot.name}`, {
            error: embeddingsError,
          });
          totalFailed++;
          continue;
        }

        if (!embeddings || embeddings.length === 0) {
          logger.warn(`No embeddings found for ${chatbot.name}`);
          continue;
        }

        logger.info(
          `Re-embedding ${embeddings.length} chunks for ${chatbot.name}`
        );

        if (dryRun) {
          logger.info(`[DRY RUN] Would regenerate ${embeddings.length} embeddings`);
          totalProcessed += embeddings.length;
          continue;
        }

        // Process in batches
        let processed = 0;
        let failed = 0;

        for (let i = 0; i < embeddings.length; i += batchSize) {
          const batch = embeddings.slice(i, i + batchSize);

          const results = await Promise.allSettled(
            batch.map(async (emb) => {
              try {
                const embedding = await embeddingService.createEmbeddingVector(emb.content);

                await supabaseAdmin
                  .from("embeddings")
                  .update({ embedding })
                  .eq("id", emb.id);

                return { success: true, id: emb.id };
              } catch (error) {
                logger.error(`Failed to regenerate embedding ${emb.id}`, {
                  error,
                  page_url: emb.page_url,
                });
                return { success: false, id: emb.id };
              }
            })
          );

          // Count successes and failures
          results.forEach((result) => {
            if (result.status === "fulfilled" && result.value.success) {
              processed++;
            } else {
              failed++;
            }
          });

          const progress = Math.min(i + batchSize, embeddings.length);
          logger.info(
            `Progress: ${progress}/${embeddings.length} (${Math.round((progress / embeddings.length) * 100)}%)`
          );

          // Rate limiting - wait 100ms between batches to avoid API limits
          if (i + batchSize < embeddings.length) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }

        logger.info(`Completed ${chatbot.name}`, {
          processed,
          failed,
          total: embeddings.length,
        });

        totalProcessed += processed;
        totalFailed += failed;

        // Set status back to 'ready'
        await supabaseAdmin
          .from("chatbots")
          .update({ status: "ready" })
          .eq("id", chatbot.id);
      } catch (error) {
        logger.error(`Failed to process chatbot ${chatbot.name}`, { error });
        totalFailed++;

        // Try to restore status
        try {
          await supabaseAdmin
            .from("chatbots")
            .update({ status: "failed" })
            .eq("id", chatbot.id);
        } catch (updateError) {
          logger.error("Failed to update chatbot status", { updateError });
        }
      }
    }

    logger.info("Embedding regeneration completed", {
      totalProcessed,
      totalFailed,
      chatbotsProcessed: chatbots.length,
    });

    // Exit with error code if any failed
    if (totalFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    logger.error("Fatal error during embedding regeneration", { error });
    process.exit(1);
  }
}

// Parse command line arguments
function parseArgs(): RegenerateOptions {
  const args = process.argv.slice(2);
  const options: RegenerateOptions = {};

  for (const arg of args) {
    if (arg.startsWith("--chatbot-id=")) {
      options.chatbotId = arg.split("=")[1];
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = parseInt(arg.split("=")[1], 10);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  return options;
}

// Main execution
if (require.main === module) {
  const options = parseArgs();
  regenerateAllEmbeddings(options).catch((error) => {
    logger.error("Unhandled error", { error });
    process.exit(1);
  });
}

export { regenerateAllEmbeddings };
