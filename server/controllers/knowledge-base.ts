import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middleware/clerkAuth";
import { NotFoundError, AuthorizationError, ValidationError } from "../utils/errors";
import { knowledgeBaseService } from "../services/knowledge-base";
import logger from "../utils/logger";
import { supabaseAdmin } from "../utils/supabase";

/**
 * Add a new knowledge base entry
 * POST /api/chatbots/:id/knowledge
 */
export async function addKnowledgeEntry(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const { id: chatbotId } = req.params;
    const { question, answer, category, priority } = req.body;

    // Verify chatbot ownership
    const { data: chatbot } = await supabaseAdmin
      .from("chatbots")
      .select("user_id")
      .eq("id", chatbotId)
      .single();

    if (!chatbot) {
      throw new NotFoundError("Chatbot not found");
    }

    if (chatbot.user_id !== req.user.userId) {
      throw new AuthorizationError("Not authorized to modify this chatbot");
    }

    // Validate required fields
    if (!question || !answer) {
      throw new ValidationError("Question and answer are required");
    }

    // Add knowledge entry
    const entry = await knowledgeBaseService.addKnowledgeEntry(
      chatbotId,
      question,
      answer,
      category,
      priority || 0
    );

    logger.info("Knowledge entry added", {
      chatbotId,
      entryId: entry.id,
      userId: req.user.userId,
    });

    res.status(201).json(entry);
  } catch (error) {
    next(error);
  }
}

/**
 * List knowledge base entries
 * GET /api/chatbots/:id/knowledge
 */
export async function listKnowledgeEntries(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const { id: chatbotId } = req.params;
    const { category, enabled, search, page = "1", limit = "50" } = req.query;

    // Verify chatbot ownership
    const { data: chatbot } = await supabaseAdmin
      .from("chatbots")
      .select("user_id")
      .eq("id", chatbotId)
      .single();

    if (!chatbot) {
      throw new NotFoundError("Chatbot not found");
    }

    if (chatbot.user_id !== req.user.userId) {
      throw new AuthorizationError("Not authorized to access this chatbot");
    }

    // Build filters
    const filters: {
      category?: string;
      enabled?: boolean;
      search?: string;
    } = {};

    if (category) {
      filters.category = category as string;
    }

    if (enabled !== undefined) {
      filters.enabled = enabled === "true";
    }

    if (search) {
      filters.search = search as string;
    }

    // Get entries
    const result = await knowledgeBaseService.listKnowledgeEntries(
      chatbotId,
      filters,
      parseInt(page as string, 10),
      parseInt(limit as string, 10)
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Get a single knowledge base entry
 * GET /api/chatbots/:id/knowledge/:entryId
 */
export async function getKnowledgeEntry(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const { id: chatbotId, entryId } = req.params;

    // Verify chatbot ownership
    const { data: chatbot } = await supabaseAdmin
      .from("chatbots")
      .select("user_id")
      .eq("id", chatbotId)
      .single();

    if (!chatbot) {
      throw new NotFoundError("Chatbot not found");
    }

    if (chatbot.user_id !== req.user.userId) {
      throw new AuthorizationError("Not authorized to access this chatbot");
    }

    // Get entry
    const entry = await knowledgeBaseService.getKnowledgeEntry(entryId);

    if (!entry || entry.chatbot_id !== chatbotId) {
      throw new NotFoundError("Knowledge entry not found");
    }

    res.json(entry);
  } catch (error) {
    next(error);
  }
}

/**
 * Update a knowledge base entry
 * PATCH /api/chatbots/:id/knowledge/:entryId
 */
export async function updateKnowledgeEntry(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const { id: chatbotId, entryId } = req.params;
    const { question, answer, category, priority, enabled } = req.body;

    // Verify chatbot ownership
    const { data: chatbot } = await supabaseAdmin
      .from("chatbots")
      .select("user_id")
      .eq("id", chatbotId)
      .single();

    if (!chatbot) {
      throw new NotFoundError("Chatbot not found");
    }

    if (chatbot.user_id !== req.user.userId) {
      throw new AuthorizationError("Not authorized to modify this chatbot");
    }

    // Verify entry exists and belongs to this chatbot
    const existingEntry = await knowledgeBaseService.getKnowledgeEntry(entryId);
    if (!existingEntry || existingEntry.chatbot_id !== chatbotId) {
      throw new NotFoundError("Knowledge entry not found");
    }

    // Build updates object
    const updates: {
      question?: string;
      answer?: string;
      category?: string | null;
      priority?: number;
      enabled?: boolean;
    } = {};

    if (question !== undefined) updates.question = question;
    if (answer !== undefined) updates.answer = answer;
    if (category !== undefined) updates.category = category;
    if (priority !== undefined) updates.priority = priority;
    if (enabled !== undefined) updates.enabled = enabled;

    // Update entry
    const updatedEntry = await knowledgeBaseService.updateKnowledgeEntry(
      entryId,
      updates
    );

    logger.info("Knowledge entry updated", {
      chatbotId,
      entryId,
      userId: req.user.userId,
    });

    res.json(updatedEntry);
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a knowledge base entry
 * DELETE /api/chatbots/:id/knowledge/:entryId
 */
export async function deleteKnowledgeEntry(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const { id: chatbotId, entryId } = req.params;

    // Verify chatbot ownership
    const { data: chatbot } = await supabaseAdmin
      .from("chatbots")
      .select("user_id")
      .eq("id", chatbotId)
      .single();

    if (!chatbot) {
      throw new NotFoundError("Chatbot not found");
    }

    if (chatbot.user_id !== req.user.userId) {
      throw new AuthorizationError("Not authorized to modify this chatbot");
    }

    // Verify entry exists and belongs to this chatbot
    const existingEntry = await knowledgeBaseService.getKnowledgeEntry(entryId);
    if (!existingEntry || existingEntry.chatbot_id !== chatbotId) {
      throw new NotFoundError("Knowledge entry not found");
    }

    // Delete entry (chatbotId дамжуулж cache invalidation хийнэ)
    await knowledgeBaseService.deleteKnowledgeEntry(entryId, chatbotId);

    logger.info("Knowledge entry deleted", {
      chatbotId,
      entryId,
      userId: req.user.userId,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

/**
 * Bulk import knowledge base entries
 * POST /api/chatbots/:id/knowledge/bulk
 */
export async function bulkImportKnowledge(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const { id: chatbotId } = req.params;
    const { entries } = req.body;

    // Verify chatbot ownership
    const { data: chatbot } = await supabaseAdmin
      .from("chatbots")
      .select("user_id")
      .eq("id", chatbotId)
      .single();

    if (!chatbot) {
      throw new NotFoundError("Chatbot not found");
    }

    if (chatbot.user_id !== req.user.userId) {
      throw new AuthorizationError("Not authorized to modify this chatbot");
    }

    // Validate entries array
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new ValidationError("Entries must be a non-empty array");
    }

    // Validate each entry
    for (const entry of entries) {
      if (!entry.question || !entry.answer) {
        throw new ValidationError(
          "Each entry must have a question and answer"
        );
      }
    }

    // Bulk import
    const result = await knowledgeBaseService.bulkImport(chatbotId, entries);

    logger.info("Bulk import completed", {
      chatbotId,
      userId: req.user.userId,
      success: result.success,
      failed: result.failed,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Get knowledge base statistics
 * GET /api/chatbots/:id/knowledge/stats
 */
export async function getKnowledgeStats(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const { id: chatbotId } = req.params;

    // Verify chatbot ownership
    const { data: chatbot } = await supabaseAdmin
      .from("chatbots")
      .select("user_id")
      .eq("id", chatbotId)
      .single();

    if (!chatbot) {
      throw new NotFoundError("Chatbot not found");
    }

    if (chatbot.user_id !== req.user.userId) {
      throw new AuthorizationError("Not authorized to access this chatbot");
    }

    // Get statistics
    const stats = await knowledgeBaseService.getStatistics(chatbotId);

    res.json(stats);
  } catch (error) {
    next(error);
  }
}
