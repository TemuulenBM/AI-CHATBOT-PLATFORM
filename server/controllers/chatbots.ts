import { Response, NextFunction } from "express";
import { supabaseAdmin, ChatbotSettings } from "../utils/supabase";
import { AuthenticatedRequest, checkUsageLimit, incrementUsage } from "../middleware/auth";
import { NotFoundError, AuthorizationError } from "../utils/errors";
import { CreateChatbotInput, UpdateChatbotInput } from "../middleware/validation";
import { deleteCache, deleteCachePattern, getCache, setCache } from "../utils/redis";
import { scrapeQueue } from "../jobs/queues";
import logger from "../utils/logger";
import * as analyticsService from "../services/analytics";

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

    // Create chatbot with "ready" status for instant deployment
    // Training will happen in background, chatbot uses fallback mode until "trained"
    const { data: chatbot, error } = await supabaseAdmin
      .from("chatbots")
      .insert({
        user_id: req.user.userId,
        name,
        website_url: websiteUrl,
        status: "ready", // Instant deployment - chatbot is immediately usable
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
      message: "Chatbot deployed successfully! It's ready to use while we train it on your website content.",
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

// Get dashboard stats
export async function getStats(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const userId = req.user.userId;

    // Use analytics service with built-in caching
    const stats = await analyticsService.getDashboardStats(userId);

    res.json(stats);
  } catch (error) {
    next(error);
  }
}

// Get message volume trends for the dashboard chart
export async function getMessageVolume(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const days = parseInt(req.query.days as string) || 7;
    const validDays = Math.min(Math.max(days, 1), 30); // Limit to 1-30 days

    const volume = await analyticsService.getMessageVolumeByDay(
      req.user.userId,
      validDays
    );

    res.json({ volume });
  } catch (error) {
    next(error);
  }
}

// Get conversation trends for a specific chatbot
export async function getConversationTrends(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const { id } = req.params;
    const days = parseInt(req.query.days as string) || 7;
    const validDays = Math.min(Math.max(days, 1), 30);

    // Verify ownership
    const { data: chatbot, error } = await supabaseAdmin
      .from("chatbots")
      .select("id")
      .eq("id", id)
      .eq("user_id", req.user.userId)
      .single();

    if (error || !chatbot) {
      throw new NotFoundError("Chatbot");
    }

    const trends = await analyticsService.getConversationTrends(id, validDays);

    res.json({ trends });
  } catch (error) {
    next(error);
  }
}

// Get top questions for a chatbot
export async function getTopQuestions(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    const validLimit = Math.min(Math.max(limit, 1), 50);

    // Verify ownership
    const { data: chatbot, error } = await supabaseAdmin
      .from("chatbots")
      .select("id")
      .eq("id", id)
      .eq("user_id", req.user.userId)
      .single();

    if (error || !chatbot) {
      throw new NotFoundError("Chatbot");
    }

    const questions = await analyticsService.getTopQuestions(id, validLimit);

    res.json({ questions });
  } catch (error) {
    next(error);
  }
}

// Get chatbot analytics
export async function getChatbotAnalytics(
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
    const { data: chatbot, error } = await supabaseAdmin
      .from("chatbots")
      .select("id, name")
      .eq("id", id)
      .eq("user_id", req.user.userId)
      .single();

    if (error || !chatbot) {
      throw new NotFoundError("Chatbot");
    }

    const analytics = await analyticsService.getChatbotAnalytics(id);

    res.json({
      ...analytics,
      name: chatbot.name,
    });
  } catch (error) {
    next(error);
  }
}

// Get sentiment breakdown for a chatbot
export async function getSentimentBreakdown(
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
    const { data: chatbot, error } = await supabaseAdmin
      .from("chatbots")
      .select("id")
      .eq("id", id)
      .eq("user_id", req.user.userId)
      .single();

    if (error || !chatbot) {
      throw new NotFoundError("Chatbot");
    }

    const breakdown = await analyticsService.getSentimentBreakdown(id);

    res.json(breakdown);
  } catch (error) {
    next(error);
  }
}

// Get conversations for a chatbot with pagination
export async function getConversations(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = (page - 1) * limit;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    // Verify ownership
    const { data: chatbot, error: chatbotError } = await supabaseAdmin
      .from("chatbots")
      .select("id")
      .eq("id", id)
      .eq("user_id", req.user.userId)
      .single();

    if (chatbotError || !chatbot) {
      throw new NotFoundError("Chatbot");
    }

    // Build query
    let query = supabaseAdmin
      .from("conversations")
      .select("id, session_id, messages, created_at, updated_at", { count: "exact" })
      .eq("chatbot_id", id)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data: conversations, error, count } = await query;

    if (error) {
      logger.error("Failed to fetch conversations", { error, chatbotId: id });
      throw new Error("Failed to fetch conversations");
    }

    // Transform conversations to include message count and preview
    const transformedConversations = (conversations || []).map((conv) => {
      const messages = conv.messages as { role: string; content: string; timestamp: string }[];
      const firstUserMessage = messages?.find((m) => m.role === "user");

      return {
        id: conv.id,
        sessionId: conv.session_id,
        messageCount: Array.isArray(messages) ? messages.length : 0,
        preview: firstUserMessage?.content?.substring(0, 100) || "No messages",
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
      };
    });

    res.json({
      conversations: transformedConversations,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    next(error);
  }
}

// Get all conversations across all user's chatbots
export async function getAllConversations(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    // Query params are already validated and transformed by middleware
    const page = typeof req.query.page === "number" ? req.query.page : 1;
    const limit = typeof req.query.limit === "number" ? Math.min(req.query.limit, 50) : 20;
    const offset = (page - 1) * limit;
    const chatbotId = req.query.chatbotId as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    // Get all user's chatbot IDs
    let chatbotQuery = supabaseAdmin
      .from("chatbots")
      .select("id, name")
      .eq("user_id", req.user.userId);

    if (chatbotId) {
      chatbotQuery = chatbotQuery.eq("id", chatbotId);
    }

    const { data: chatbots, error: chatbotsError } = await chatbotQuery;

    if (chatbotsError || !chatbots || chatbots.length === 0) {
      res.json({
        conversations: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      });
      return;
    }

    const chatbotIds = chatbots.map((c) => c.id);
    const chatbotMap = new Map(chatbots.map((c) => [c.id, c.name]));

    // Build query for conversations
    let query = supabaseAdmin
      .from("conversations")
      .select("id, chatbot_id, session_id, messages, created_at, updated_at", { count: "exact" })
      .in("chatbot_id", chatbotIds)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data: conversations, error, count } = await query;

    if (error) {
      logger.error("Failed to fetch all conversations", { error, userId: req.user.userId });
      throw new Error("Failed to fetch conversations");
    }

    // Transform conversations to include message count, preview, and chatbot name
    const transformedConversations = (conversations || []).map((conv) => {
      const messages = conv.messages as { role: string; content: string; timestamp: string }[];
      const firstUserMessage = messages?.find((m) => m.role === "user");

      return {
        id: conv.id,
        chatbotId: conv.chatbot_id,
        chatbotName: chatbotMap.get(conv.chatbot_id) || "Unknown",
        sessionId: conv.session_id,
        messageCount: Array.isArray(messages) ? messages.length : 0,
        preview: firstUserMessage?.content?.substring(0, 100) || "No messages",
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
      };
    });

    res.json({
      conversations: transformedConversations,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    next(error);
  }
}

// Get a single conversation with full messages
export async function getConversation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const { id, conversationId } = req.params;

    // Verify chatbot ownership
    const { data: chatbot, error: chatbotError } = await supabaseAdmin
      .from("chatbots")
      .select("id")
      .eq("id", id)
      .eq("user_id", req.user.userId)
      .single();

    if (chatbotError || !chatbot) {
      throw new NotFoundError("Chatbot");
    }

    // Get conversation
    const { data: conversation, error } = await supabaseAdmin
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("chatbot_id", id)
      .single();

    if (error || !conversation) {
      throw new NotFoundError("Conversation");
    }

    res.json(conversation);
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

    // Domain whitelist validation
    const origin = req.get("origin") || req.get("referer");
    if (chatbot.settings.allowedDomains && chatbot.settings.allowedDomains.length > 0 && origin) {
      try {
        const originUrl = new URL(origin);
        const originHost = originUrl.hostname.toLowerCase();
        const isAllowed = chatbot.settings.allowedDomains.some((domain: string) => {
          const normalizedDomain = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
          // Allow exact match or subdomain match
          return originHost === normalizedDomain || originHost.endsWith(`.${normalizedDomain}`);
        });

        if (!isAllowed) {
          res.status(403).json({
            error: "Domain not authorized",
            message: "This chatbot is not authorized to run on this domain.",
          });
          return;
        }
      } catch {
        // Invalid origin URL, allow request to proceed (could be direct API call)
      }
    }

    // Get embedding count to determine training status
    const { count: embeddingCount } = await supabaseAdmin
      .from("embeddings")
      .select("*", { count: "exact", head: true })
      .eq("chatbot_id", id);

    res.json({
      id: chatbot.id,
      name: chatbot.name,
      settings: {
        primaryColor: chatbot.settings.primaryColor,
        welcomeMessage: chatbot.settings.welcomeMessage,
        // Widget v2.0 settings
        preChatForm: chatbot.settings.preChatForm,
        proactiveTriggers: chatbot.settings.proactiveTriggers,
        locale: chatbot.settings.locale,
        soundEnabled: chatbot.settings.soundEnabled,
        // Advanced customization settings
        position: chatbot.settings.position,
        widgetSize: chatbot.settings.widgetSize,
        borderRadius: chatbot.settings.borderRadius,
        fontFamily: chatbot.settings.fontFamily,
        headerStyle: chatbot.settings.headerStyle,
        showBranding: chatbot.settings.showBranding,
        openDelay: chatbot.settings.openDelay,
        showInitially: chatbot.settings.showInitially,
        animationStyle: chatbot.settings.animationStyle,
      },
      isTraining: (embeddingCount || 0) === 0, // Still training if no embeddings
    });
  } catch (error) {
    next(error);
  }
}
