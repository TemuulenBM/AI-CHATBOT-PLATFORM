/**
 * Regenerate Knowledge Base Embeddings Script
 *
 * This script re-generates embeddings for all knowledge base entries after migration 005.
 * Migration 005 drops and recreates the embedding column, requiring all
 * embeddings to be regenerated.
 *
 * Usage:
 *   npm run tsx server/scripts/regenerate-knowledge-base.ts
 *
 * Options:
 *   --chatbot-id=<uuid>  Regenerate only for specific chatbot
 *   --batch-size=<num>   Number of entries to process in parallel (default: 10)
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

async function regenerateKnowledgeBaseEmbeddings(
  options: RegenerateOptions = {}
) {
  const { chatbotId, batchSize = 10, dryRun = false } = options;

  logger.info("Starting knowledge base embedding regeneration", {
    chatbotId,
    batchSize,
    dryRun,
  });

  try {
    // Get knowledge base entries to process
    let query = supabaseAdmin
      .from("knowledge_base")
      .select("id, question, answer, chatbot_id, category")
      .eq("enabled", true);

    if (chatbotId) {
      query = query.eq("chatbot_id", chatbotId);
    }

    const { data: kbEntries, error: kbError } = await query;

    if (kbError) {
      logger.error("Failed to fetch knowledge base entries", { error: kbError });
      throw kbError;
    }

    if (!kbEntries || kbEntries.length === 0) {
      logger.warn("No knowledge base entries found to process");
      return;
    }

    logger.info(`Found ${kbEntries.length} knowledge base entry(ies) to process`);

    if (dryRun) {
      logger.info(
        `[DRY RUN] Would regenerate ${kbEntries.length} knowledge base embeddings`
      );
      return;
    }

    let processed = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < kbEntries.length; i += batchSize) {
      const batch = kbEntries.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(async (entry) => {
          try {
            // Combine question and answer for embedding
            const content = `${entry.question}\n${entry.answer}`;
            const embedding = await embeddingService.createEmbeddingVector(content);

            await supabaseAdmin
              .from("knowledge_base")
              .update({ embedding })
              .eq("id", entry.id);

            logger.debug(`Re-embedded KB entry ${entry.id}`, {
              category: entry.category,
              chatbot_id: entry.chatbot_id,
            });

            return { success: true, id: entry.id };
          } catch (error) {
            logger.error(`Failed to re-embed KB entry ${entry.id}`, {
              error,
              question: entry.question.substring(0, 100),
            });
            return { success: false, id: entry.id };
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

      const progress = Math.min(i + batchSize, kbEntries.length);
      logger.info(
        `Progress: ${progress}/${kbEntries.length} (${Math.round((progress / kbEntries.length) * 100)}%)`
      );

      // Rate limiting - wait 100ms between batches
      if (i + batchSize < kbEntries.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    logger.info("Knowledge base embedding regeneration completed", {
      processed,
      failed,
      total: kbEntries.length,
    });

    // Exit with error code if any failed
    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    logger.error("Fatal error during knowledge base embedding regeneration", {
      error,
    });
    process.exit(1);
  }
}

// Parse command line arguments
export function parseArgs(): RegenerateOptions {
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
  regenerateKnowledgeBaseEmbeddings(options).catch((error) => {
    logger.error("Unhandled error", { error });
    process.exit(1);
  });
}

export { regenerateKnowledgeBaseEmbeddings };
