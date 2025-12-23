import { Response, NextFunction } from "express";
import { supabaseAdmin, ChatbotSettings } from "../utils/supabase";
import { AuthenticatedRequest, checkUsageLimit, incrementUsage } from "../middleware/auth";
import { NotFoundError, AuthorizationError } from "../utils/errors";
import { CreateChatbotInput, UpdateChatbotInput } from "../middleware/validation";
import { deleteCache, deleteCachePattern, getCache, setCache } from "../utils/redis";
import { scrapeQueue } from "../jobs/queues";
import logger from "../utils/logger";

export async function createChatbot(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const { name, websiteUrl, settings } = req.body as CreateChatbotInput;

    // Check usage limit
    await checkUsageLimit(req.user.userId, "chatbot");

    // Create chatbot
    const { data: chatbot, error } = await supabaseAdmin
      .from("chatbots")
      .insert({
        user_id: req.user.userId,
        name,
        website_url: websiteUrl,
        status: "pending",
        settings: settings as ChatbotSettings,
      })
      .select()
      .single();

    if (error || !chatbot) {
      logger.error("Failed to create chatbot", { error, userId: req.user.userId });
      throw new Error("Failed to create chatbot");
    }

    // Increment usage
    await incrementUsage(req.user.userId, "chatbot");

    // Queue scraping job
    await scrapeQueue.add(
      "scrape-website",
      {
        chatbotId: chatbot.id,
        websiteUrl,
        maxPages: 50,
      },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
      }
    );

    logger.info("Chatbot created", { chatbotId: chatbot.id, userId: req.user.userId });

    // Invalidate cache
    await deleteCachePattern(`chatbots:${req.user.userId}:*`);

    res.status(201).json({
      message: "Chatbot created successfully. Scraping will begin shortly.",
      chatbot,
    });
  } catch (error) {
    next(error);
  }
}

export async function listChatbots(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const offset = (page - 1) * limit;

    const cacheKey = `chatbots:${req.user.userId}:${page}:${limit}`;
    const cached = await getCache<{ chatbots: unknown[]; total: number }>(cacheKey);

    if (cached) {
      res.json(cached);
      return;
    }

    // Get chatbots
    const { data: chatbots, error, count } = await supabaseAdmin
      .from("chatbots")
      .select("*", { count: "exact" })
      .eq("user_id", req.user.userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error("Failed to fetch chatbots", { error, userId: req.user.userId });
      throw new Error("Failed to fetch chatbots");
    }

    const result = {
      chatbots: chatbots || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };

    await setCache(cacheKey, result, 60); // Cache for 1 minute

    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getChatbot(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const { id } = req.params;

    const cacheKey = `chatbot:${id}`;
    const cached = await getCache(cacheKey);

    if (cached) {
      res.json(cached);
      return;
    }

    const { data: chatbot, error } = await supabaseAdmin
      .from("chatbots")
      .select("*")
      .eq("id", id)
      .eq("user_id", req.user.userId)
      .single();

    if (error || !chatbot) {
      throw new NotFoundError("Chatbot");
    }

    // Get embedding count
    const { count: embeddingCount } = await supabaseAdmin
      .from("embeddings")
      .select("*", { count: "exact", head: true })
      .eq("chatbot_id", id);

    // Get conversation stats
    const { count: conversationCount } = await supabaseAdmin
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("chatbot_id", id);

    const result = {
      ...chatbot,
      stats: {
        embeddings: embeddingCount || 0,
        conversations: conversationCount || 0,
      },
    };

    await setCache(cacheKey, result, 300);

    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function updateChatbot(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const { id } = req.params;
    const updates = req.body as UpdateChatbotInput;

    // Verify ownership
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("chatbots")
      .select("id, settings")
      .eq("id", id)
      .eq("user_id", req.user.userId)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundError("Chatbot");
    }

    // Merge settings if provided
    const newSettings = updates.settings
      ? { ...existing.settings, ...updates.settings }
      : existing.settings;

    const { data: chatbot, error } = await supabaseAdmin
      .from("chatbots")
      .update({
        ...(updates.name && { name: updates.name }),
        settings: newSettings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error || !chatbot) {
      logger.error("Failed to update chatbot", { error, chatbotId: id });
      throw new Error("Failed to update chatbot");
    }

    // Invalidate caches
    await deleteCache(`chatbot:${id}`);
    await deleteCachePattern(`chatbots:${req.user.userId}:*`);

    res.json({
      message: "Chatbot updated successfully",
      chatbot,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteChatbot(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const { id } = req.params;

    // Verify ownership
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("chatbots")
      .select("id")
      .eq("id", id)
      .eq("user_id", req.user.userId)
      .single();

    if (fetchError || !existing) {
      throw new NotFoundError("Chatbot");
    }

    // Delete embeddings first
    await supabaseAdmin.from("embeddings").delete().eq("chatbot_id", id);

    // Delete conversations
    await supabaseAdmin.from("conversations").delete().eq("chatbot_id", id);

    // Delete chatbot
    const { error } = await supabaseAdmin.from("chatbots").delete().eq("id", id);

    if (error) {
      logger.error("Failed to delete chatbot", { error, chatbotId: id });
      throw new Error("Failed to delete chatbot");
    }

    // Invalidate caches
    await deleteCache(`chatbot:${id}`);
    await deleteCachePattern(`chatbots:${req.user.userId}:*`);

    logger.info("Chatbot deleted", { chatbotId: id, userId: req.user.userId });

    res.json({ message: "Chatbot deleted successfully" });
  } catch (error) {
    next(error);
  }
}

// Public endpoint for widget
export async function getChatbotPublic(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    const { data: chatbot, error } = await supabaseAdmin
      .from("chatbots")
      .select("id, name, settings, status")
      .eq("id", id)
      .eq("status", "ready")
      .single();

    if (error || !chatbot) {
      throw new NotFoundError("Chatbot");
    }

    res.json({
      id: chatbot.id,
      name: chatbot.name,
      settings: {
        primaryColor: chatbot.settings.primaryColor,
        welcomeMessage: chatbot.settings.welcomeMessage,
      },
    });
  } catch (error) {
    next(error);
  }
}
