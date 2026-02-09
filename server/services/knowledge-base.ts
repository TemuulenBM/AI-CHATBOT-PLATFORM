import OpenAI from "openai";
import { supabaseAdmin } from "../utils/supabase";
import { getCache, setCache, deleteCachePattern } from "../utils/redis";
import logger from "../utils/logger";
import { ExternalServiceError } from "../utils/errors";
import type { KnowledgeBase, InsertKnowledgeBase } from "../../shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL = "text-embedding-3-small";

interface KnowledgeMatch {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  priority: number;
  similarity: number;
}

interface KnowledgeFilters {
  category?: string;
  enabled?: boolean;
  search?: string;
}

export class KnowledgeBaseService {
  /**
   * Generate embedding for knowledge base entry (question + answer combined)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error("Failed to create knowledge base embedding", { error });
      throw new ExternalServiceError("OpenAI", "Failed to create embedding");
    }
  }

  /**
   * Add a new knowledge base entry
   */
  async addKnowledgeEntry(
    chatbotId: string,
    question: string,
    answer: string,
    category?: string,
    priority: number = 0
  ): Promise<KnowledgeBase> {
    try {
      // Generate embedding for question + answer
      const combinedText = `Question: ${question}\nAnswer: ${answer}`;
      const embedding = await this.generateEmbedding(combinedText);

      const { data, error } = await supabaseAdmin
        .from("knowledge_base")
        .insert({
          chatbot_id: chatbotId,
          question,
          answer,
          category,
          priority,
          enabled: true,
          embedding,
        })
        .select()
        .single();

      if (error) {
        logger.error("Failed to add knowledge entry", { error, chatbotId });
        throw new Error("Failed to add knowledge entry");
      }

      logger.info("Knowledge entry added", {
        chatbotId,
        entryId: data.id,
        category,
      });

      // Knowledge base өөрчлөгдсөн тул search cache-г цэвэрлэх
      // Эс бөгөөс хэрэглэгч 5 минут хүртэл хуучин хариулт хардаг
      await deleteCachePattern(`kb:${chatbotId}:*`);

      return data as KnowledgeBase;
    } catch (error) {
      logger.error("Error adding knowledge entry", { error, chatbotId });
      throw error;
    }
  }

  /**
   * Update an existing knowledge base entry
   */
  async updateKnowledgeEntry(
    id: string,
    updates: Partial<{
      question: string;
      answer: string;
      category: string | null;
      priority: number;
      enabled: boolean;
    }>
  ): Promise<KnowledgeBase> {
    try {
      // If question or answer is updated, regenerate embedding
      let embedding: number[] | undefined;
      if (updates.question || updates.answer) {
        // Get current entry to combine with updates
        const { data: current } = await supabaseAdmin
          .from("knowledge_base")
          .select("question, answer")
          .eq("id", id)
          .single();

        const question = updates.question || current?.question || "";
        const answer = updates.answer || current?.answer || "";
        const combinedText = `Question: ${question}\nAnswer: ${answer}`;
        embedding = await this.generateEmbedding(combinedText);
      }

      const updateData = {
        ...updates,
        ...(embedding && { embedding }),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabaseAdmin
        .from("knowledge_base")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        logger.error("Failed to update knowledge entry", { error, id });
        throw new Error("Failed to update knowledge entry");
      }

      logger.info("Knowledge entry updated", { id });

      // Knowledge base өөрчлөгдсөн тул search cache-г цэвэрлэх
      if (data?.chatbot_id) {
        await deleteCachePattern(`kb:${data.chatbot_id}:*`);
      }

      return data as KnowledgeBase;
    } catch (error) {
      logger.error("Error updating knowledge entry", { error, id });
      throw error;
    }
  }

  /**
   * Delete a knowledge base entry
   */
  async deleteKnowledgeEntry(id: string, chatbotId?: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from("knowledge_base")
      .delete()
      .eq("id", id);

    if (error) {
      logger.error("Failed to delete knowledge entry", { error, id });
      throw new Error("Failed to delete knowledge entry");
    }

    // Knowledge base өөрчлөгдсөн тул search cache-г цэвэрлэх
    if (chatbotId) {
      await deleteCachePattern(`kb:${chatbotId}:*`);
    }

    logger.info("Knowledge entry deleted", { id });
  }

  /**
   * List knowledge base entries with filtering and pagination
   */
  async listKnowledgeEntries(
    chatbotId: string,
    filters?: KnowledgeFilters,
    page: number = 1,
    limit: number = 50
  ): Promise<{ entries: KnowledgeBase[]; total: number }> {
    try {
      let query = supabaseAdmin
        .from("knowledge_base")
        .select("*", { count: "exact" })
        .eq("chatbot_id", chatbotId);

      // Apply filters
      if (filters?.category) {
        query = query.eq("category", filters.category);
      }

      if (filters?.enabled !== undefined) {
        query = query.eq("enabled", filters.enabled);
      }

      if (filters?.search) {
        query = query.or(
          `question.ilike.%${filters.search}%,answer.ilike.%${filters.search}%`
        );
      }

      // Order by priority (desc) and created_at (desc)
      query = query.order("priority", { ascending: false });
      query = query.order("created_at", { ascending: false });

      // Pagination
      const offset = (page - 1) * limit;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        logger.error("Failed to list knowledge entries", { error, chatbotId });
        throw new Error("Failed to list knowledge entries");
      }

      return {
        entries: (data as KnowledgeBase[]) || [],
        total: count || 0,
      };
    } catch (error) {
      logger.error("Error listing knowledge entries", { error, chatbotId });
      throw error;
    }
  }

  /**
   * Get a single knowledge base entry by ID
   */
  async getKnowledgeEntry(id: string): Promise<KnowledgeBase | null> {
    const { data, error } = await supabaseAdmin
      .from("knowledge_base")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      logger.error("Failed to get knowledge entry", { error, id });
      return null;
    }

    return data as KnowledgeBase;
  }

  /**
   * Search knowledge base using semantic similarity
   */
  async searchKnowledgeBase(
    chatbotId: string,
    query: string,
    limit: number = 3,
    threshold: number = 0.8
  ): Promise<KnowledgeMatch[]> {
    try {
      // Check cache first
      const cacheKey = `kb:${chatbotId}:${Buffer.from(query).toString("base64").slice(0, 32)}`;
      const cached = await getCache<KnowledgeMatch[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // Create embedding for query
      const queryEmbedding = await this.generateEmbedding(query);

      // Call the match_knowledge_base function in Supabase
      const { data, error } = await supabaseAdmin.rpc("match_knowledge_base", {
        p_chatbot_id: chatbotId,
        p_query_embedding: queryEmbedding,
        p_match_threshold: threshold,
        p_match_count: limit,
      });

      if (error) {
        logger.error("Failed to search knowledge base", { error, chatbotId });
        throw new Error("Failed to search knowledge base");
      }

      const results: KnowledgeMatch[] = (data || []).map(
        (row: {
          id: string;
          question: string;
          answer: string;
          category: string | null;
          priority: number;
          similarity: number;
        }) => ({
          id: row.id,
          question: row.question,
          answer: row.answer,
          category: row.category,
          priority: row.priority,
          similarity: row.similarity,
        })
      );

      // Cache for 5 minutes
      await setCache(cacheKey, results, 300);

      return results;
    } catch (error) {
      logger.error("Error searching knowledge base", { error, chatbotId });
      throw error;
    }
  }

  /**
   * Bulk import knowledge base entries from array
   */
  async bulkImport(
    chatbotId: string,
    entries: Array<{
      question: string;
      answer: string;
      category?: string;
      priority?: number;
    }>
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    // Process in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map((entry) =>
          this.addKnowledgeEntry(
            chatbotId,
            entry.question,
            entry.answer,
            entry.category,
            entry.priority || 0
          )
        )
      );

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          success++;
        } else {
          failed++;
          logger.error("Failed to import knowledge entry", {
            error: result.reason,
          });
        }
      });

      // Small delay between batches
      if (i + batchSize < entries.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    logger.info("Bulk import completed", { chatbotId, success, failed });

    return { success, failed };
  }

  /**
   * Get knowledge base statistics for a chatbot
   */
  async getStatistics(chatbotId: string): Promise<{
    total: number;
    enabled: number;
    byCategory: Record<string, number>;
  }> {
    const { data, error } = await supabaseAdmin
      .from("knowledge_base")
      .select("enabled, category")
      .eq("chatbot_id", chatbotId);

    if (error) {
      logger.error("Failed to get knowledge base stats", {
        error,
        chatbotId,
      });
      return { total: 0, enabled: 0, byCategory: {} };
    }

    const total = data.length;
    const enabled = data.filter((entry) => entry.enabled).length;
    const byCategory: Record<string, number> = {};

    data.forEach((entry) => {
      const category = entry.category || "Uncategorized";
      byCategory[category] = (byCategory[category] || 0) + 1;
    });

    return { total, enabled, byCategory };
  }
}

export const knowledgeBaseService = new KnowledgeBaseService();
