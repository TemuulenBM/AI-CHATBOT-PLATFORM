import OpenAI from "openai";
import { supabaseAdmin } from "../utils/supabase";
import { getCache, setCache } from "../utils/redis";
import logger from "../utils/logger";
import { ExternalServiceError } from "../utils/errors";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL = "text-embedding-3-small";
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

interface TextChunk {
  content: string;
  pageUrl: string;
}

interface SimilarContent {
  content: string;
  pageUrl: string;
  similarity: number;
}

export class EmbeddingService {
  /**
   * Split content into overlapping chunks for better context preservation
   * Uses sequential chunking with character-based overlap calculation
   */
  splitIntoChunks(content: string, pageUrl: string): TextChunk[] {
    const chunks: TextChunk[] = [];
    const words = content.split(/\s+/);

    if (words.length === 0 || content.trim().length === 0) {
      return chunks;
    }

    let startIdx = 0;

    while (startIdx < words.length) {
      let currentChunk = "";
      let endIdx = startIdx;

      // Build chunk up to CHUNK_SIZE characters
      for (let i = startIdx; i < words.length; i++) {
        const wordToAdd = words[i];
        const testChunk = currentChunk + (currentChunk ? " " : "") + wordToAdd;

        if (testChunk.length > CHUNK_SIZE && currentChunk.length > 0) {
          // We've exceeded size, use previous chunk
          break;
        }

        currentChunk = testChunk;
        endIdx = i;
      }

      // Only add if chunk is substantial (> 50 chars)
      if (currentChunk.trim().length > 50) {
        chunks.push({
          content: currentChunk.trim(),
          pageUrl,
        });
      }

      // Calculate overlap for next chunk
      if (endIdx >= words.length - 1) {
        // Last chunk, we're done
        break;
      }

      // Move back by calculating character-based overlap
      let overlapChars = 0;
      let overlapWords = 0;

      // Count back from endIdx to get ~CHUNK_OVERLAP characters
      for (let i = endIdx; i >= startIdx && overlapChars < CHUNK_OVERLAP; i--) {
        overlapChars += words[i].length + 1; // +1 for space
        overlapWords++;
      }

      // Next chunk starts with overlap
      startIdx = Math.max(startIdx + 1, endIdx - overlapWords + 1);
    }

    return chunks;
  }

  /**
   * Create embeddings for a single text using OpenAI
   */
  async createEmbeddingVector(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error("Failed to create embedding", { error });
      throw new ExternalServiceError("OpenAI", "Failed to create embedding");
    }
  }

  /**
   * Create embeddings for a scraped page and store in database
   */
  async createEmbedding(
    chatbotId: string,
    page: { url: string; title: string; content: string }
  ): Promise<void> {
    const chunks = this.splitIntoChunks(
      `${page.title}\n\n${page.content}`,
      page.url
    );

    logger.info("Creating embeddings for page", {
      chatbotId,
      url: page.url,
      chunks: chunks.length,
    });

    // Process in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      const embeddings = await Promise.all(
        batch.map(async (chunk) => {
          const embedding = await this.createEmbeddingVector(chunk.content);
          return {
            chatbot_id: chatbotId,
            content: chunk.content,
            embedding,
            page_url: chunk.pageUrl,
          };
        })
      );

      // Store in Supabase
      const { error } = await supabaseAdmin
        .from("embeddings")
        .insert(embeddings);

      if (error) {
        logger.error("Failed to store embeddings", { error, chatbotId });
        throw new Error("Failed to store embeddings");
      }

      // Small delay between batches
      if (i + batchSize < chunks.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    logger.info("Embeddings created for page", {
      chatbotId,
      url: page.url,
      totalChunks: chunks.length,
    });
  }

  /**
   * Find similar content using vector similarity search
   */
  async findSimilar(
    chatbotId: string,
    query: string,
    limit: number = 5,
    threshold: number = 0.7
  ): Promise<SimilarContent[]> {
    // Check cache first
    const cacheKey = `similar:${chatbotId}:${Buffer.from(query).toString("base64").slice(0, 32)}`;
    const cached = await getCache<SimilarContent[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // Create embedding for query
    const queryEmbedding = await this.createEmbeddingVector(query);

    // Call the match_embeddings function in Supabase
    const { data, error } = await supabaseAdmin.rpc("match_embeddings", {
      p_chatbot_id: chatbotId,
      p_query_embedding: queryEmbedding,
      p_match_threshold: threshold,
      p_match_count: limit,
    });

    if (error) {
      logger.error("Failed to find similar embeddings", { error, chatbotId });
      throw new Error("Failed to search knowledge base");
    }

    const results: SimilarContent[] = (data || []).map((row: { content: string; page_url: string; similarity: number }) => ({
      content: row.content,
      pageUrl: row.page_url,
      similarity: row.similarity,
    }));

    // Cache for 5 minutes
    await setCache(cacheKey, results, 300);

    return results;
  }

  /**
   * Delete all embeddings for a chatbot
   */
  async deleteEmbeddings(chatbotId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from("embeddings")
      .delete()
      .eq("chatbot_id", chatbotId);

    if (error) {
      logger.error("Failed to delete embeddings", { error, chatbotId });
      throw new Error("Failed to delete embeddings");
    }

    logger.info("Embeddings deleted", { chatbotId });
  }

  /**
   * Тодорхой хугацаанаас өмнөх embedding-уудыг устгах (swap pattern-д ашиглана)
   * Шинэ embedding үүсгэсний дараа хуучныг нь устгахад зориулагдсан
   */
  async deleteEmbeddingsBefore(chatbotId: string, beforeTimestamp: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from("embeddings")
      .delete()
      .eq("chatbot_id", chatbotId)
      .lt("created_at", beforeTimestamp);

    if (error) {
      logger.error("Failed to delete old embeddings", { error, chatbotId, beforeTimestamp });
      throw new Error("Failed to delete old embeddings");
    }

    logger.info("Old embeddings deleted (swap pattern)", { chatbotId, beforeTimestamp });
  }

  /**
   * Get embedding count for a chatbot
   */
  async getEmbeddingCount(chatbotId: string): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from("embeddings")
      .select("*", { count: "exact", head: true })
      .eq("chatbot_id", chatbotId);

    if (error) {
      logger.error("Failed to get embedding count", { error, chatbotId });
      return 0;
    }

    return count || 0;
  }
}

export const embeddingService = new EmbeddingService();
