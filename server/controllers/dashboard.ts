import { Response, NextFunction } from "express";
import { supabaseAdmin } from "../utils/supabase";
import { AuthenticatedRequest } from "../middleware/clerkAuth";
import { AuthorizationError } from "../utils/errors";
import logger from "../utils/logger";

/**
 * Get consolidated dashboard overview data
 * Combines multiple endpoints into one for better performance
 */
export async function getDashboardOverview(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError();
    }

    const days = parseInt(req.query.days as string) || 7;
    const userId = req.user.userId;

    // Execute all queries in parallel for maximum performance
    const [
      statsResult,
      chatbotsResult,
      messageVolumeResult,
      comparisonResult,
      sentimentResult,
      satisfactionResult
    ] = await Promise.allSettled([
      // Stats query
      getStats(userId),
      // Chatbots list
      getChatbots(userId),
      // Message volume
      getMessageVolume(userId, days),
      // Chatbot comparison
      getChatbotComparison(userId),
      // Sentiment for first active chatbot
      getFirstBotSentiment(userId),
      // Satisfaction for first active chatbot
      getFirstBotSatisfaction(userId)
    ]);

    // Extract results, providing fallbacks for failures
    const stats = statsResult.status === 'fulfilled' ? statsResult.value : getDefaultStats();
    const chatbots = chatbotsResult.status === 'fulfilled' ? chatbotsResult.value : [];
    const messageVolume = messageVolumeResult.status === 'fulfilled' ? messageVolumeResult.value : [];
    const chatbotComparison = comparisonResult.status === 'fulfilled' ? comparisonResult.value : [];
    const sentiment = sentimentResult.status === 'fulfilled' ? sentimentResult.value : null;
    const satisfaction = satisfactionResult.status === 'fulfilled' ? satisfactionResult.value : null;

    // Log any failures (but don't fail the whole request)
    if (statsResult.status === 'rejected') {
      logger.warn('Failed to fetch stats', { error: statsResult.reason, userId });
    }
    if (chatbotsResult.status === 'rejected') {
      logger.warn('Failed to fetch chatbots', { error: chatbotsResult.reason, userId });
    }
    if (messageVolumeResult.status === 'rejected') {
      logger.warn('Failed to fetch message volume', { error: messageVolumeResult.reason, userId });
    }
    if (comparisonResult.status === 'rejected') {
      logger.warn('Failed to fetch chatbot comparison', { error: comparisonResult.reason, userId });
    }

    logger.info('Dashboard overview fetched', { userId, days });

    res.json({
      stats,
      chatbots,
      messageVolume,
      chatbotComparison,
      sentiment,
      satisfaction
    });
  } catch (error) {
    logger.error('Dashboard overview error', { error, userId: req.user?.userId });
    next(error);
  }
}

/**
 * Get user stats
 */
async function getStats(userId: string) {
  // Get total chatbots
  const { count: totalChatbots } = await supabaseAdmin
    .from("chatbots")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  // Get active chatbots
  const { count: activeChatbots } = await supabaseAdmin
    .from("chatbots")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "ready");

  // Get all user's chatbot IDs for conversation and message queries
  const { data: userChatbots } = await supabaseAdmin
    .from("chatbots")
    .select("id")
    .eq("user_id", userId);

  const chatbotIds = userChatbots?.map(c => c.id) || [];

  if (chatbotIds.length === 0) {
    return {
      totalChatbots: totalChatbots || 0,
      activeChatbots: activeChatbots || 0,
      totalMessages: 0,
      totalConversations: 0,
      avgResponseTime: null,
    };
  }

  // Get total conversations
  const { count: totalConversations } = await supabaseAdmin
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .in("chatbot_id", chatbotIds);

  // Get conversations with messages to count total messages
  const { data: conversations } = await supabaseAdmin
    .from("conversations")
    .select("messages")
    .in("chatbot_id", chatbotIds);

  const totalMessages = conversations?.reduce((sum, conv) => {
    return sum + (Array.isArray(conv.messages) ? conv.messages.length : 0);
  }, 0) || 0;

  // Calculate average response time (simplified - can be enhanced later)
  const avgResponseTime = null; // TODO: Implement if response_time_ms field exists

  return {
    totalChatbots: totalChatbots || 0,
    activeChatbots: activeChatbots || 0,
    totalMessages,
    totalConversations: totalConversations || 0,
    avgResponseTime,
  };
}

/**
 * Get default stats (fallback)
 */
function getDefaultStats() {
  return {
    totalChatbots: 0,
    activeChatbots: 0,
    totalMessages: 0,
    totalConversations: 0,
    avgResponseTime: null,
  };
}

/**
 * Get user's chatbots
 */
async function getChatbots(userId: string) {
  const { data: chatbots } = await supabaseAdmin
    .from("chatbots")
    .select(`
      id,
      name,
      website_url,
      status,
      settings,
      pages_scraped,
      created_at,
      updated_at,
      last_scraped_at,
      scrape_frequency,
      auto_scrape_enabled
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return chatbots || [];
}

/**
 * Get message volume over time
 */
async function getMessageVolume(userId: string, days: number) {
  // Get user's chatbot IDs
  const { data: userChatbots } = await supabaseAdmin
    .from("chatbots")
    .select("id")
    .eq("user_id", userId);

  const chatbotIds = userChatbots?.map(c => c.id) || [];

  if (chatbotIds.length === 0) {
    // Return empty volume for date range
    const volume = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      volume.push({
        date: date.toISOString().split('T')[0],
        messages: 0
      });
    }
    return volume;
  }

  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Fetch conversations in date range
  const { data: conversations } = await supabaseAdmin
    .from("conversations")
    .select("messages, created_at")
    .in("chatbot_id", chatbotIds)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString());

  // Group messages by date
  const messagesByDate = new Map<string, number>();

  conversations?.forEach(conv => {
    if (Array.isArray(conv.messages)) {
      conv.messages.forEach((msg: any) => {
        const msgDate = new Date(msg.timestamp).toISOString().split('T')[0];
        messagesByDate.set(msgDate, (messagesByDate.get(msgDate) || 0) + 1);
      });
    }
  });

  // Build volume array with all dates
  const volume = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    volume.push({
      date: dateStr,
      messages: messagesByDate.get(dateStr) || 0
    });
  }

  return volume;
}

/**
 * Get chatbot comparison data
 */
async function getChatbotComparison(userId: string) {
  // Get user's chatbots
  const { data: chatbots } = await supabaseAdmin
    .from("chatbots")
    .select("id, name")
    .eq("user_id", userId);

  if (!chatbots || chatbots.length === 0) {
    return [];
  }

  const comparison = await Promise.all(
    chatbots.map(async (bot) => {
      // Get conversation stats
      const { data: conversations } = await supabaseAdmin
        .from("conversations")
        .select("messages")
        .eq("chatbot_id", bot.id);

      const totalMessages = conversations?.reduce((sum, conv) => {
        return sum + (Array.isArray(conv.messages) ? conv.messages.length : 0);
      }, 0) || 0;

      const totalConversations = conversations?.length || 0;

      // Get feedback data for CSAT
      const { data: feedback } = await supabaseAdmin
        .from("feedback")
        .select("rating")
        .eq("chatbot_id", bot.id);

      let csatScore = null;
      if (feedback && feedback.length > 0) {
        const positive = feedback.filter(f => f.rating === 'positive').length;
        csatScore = Math.round((positive / feedback.length) * 100);
      }

      return {
        chatbotId: bot.id,
        chatbotName: bot.name,
        totalMessages,
        totalConversations,
        csatScore,
        avgResponseTimeMs: null, // TODO: Implement if response_time_ms exists
        conversionRate: null, // TODO: Implement conversion tracking
      };
    })
  );

  return comparison;
}

/**
 * Get sentiment data for first active chatbot
 */
async function getFirstBotSentiment(userId: string) {
  // Get first active chatbot
  const { data: chatbot } = await supabaseAdmin
    .from("chatbots")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "ready")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!chatbot) {
    return null;
  }

  // Get conversations with sentiment
  const { data: conversations } = await supabaseAdmin
    .from("conversations")
    .select("messages")
    .eq("chatbot_id", chatbot.id);

  if (!conversations || conversations.length === 0) {
    return null;
  }

  let positive = 0;
  let neutral = 0;
  let negative = 0;
  let total = 0;

  conversations.forEach(conv => {
    if (Array.isArray(conv.messages)) {
      conv.messages.forEach((msg: any) => {
        if (msg.sentiment) {
          total++;
          if (msg.sentiment === 'positive') positive++;
          else if (msg.sentiment === 'neutral') neutral++;
          else if (msg.sentiment === 'negative') negative++;
        }
      });
    }
  });

  if (total === 0) {
    return null;
  }

  return {
    positive,
    neutral,
    negative,
    total,
    positiveRate: Math.round((positive / total) * 100),
    negativeRate: Math.round((negative / total) * 100),
  };
}

/**
 * Get satisfaction data for first active chatbot
 */
async function getFirstBotSatisfaction(userId: string) {
  // Get first active chatbot
  const { data: chatbot } = await supabaseAdmin
    .from("chatbots")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "ready")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!chatbot) {
    return null;
  }

  // Get feedback
  const { data: feedback } = await supabaseAdmin
    .from("feedback")
    .select("rating")
    .eq("chatbot_id", chatbot.id);

  if (!feedback || feedback.length === 0) {
    return null;
  }

  const positive = feedback.filter(f => f.rating === 'positive').length;
  const negative = feedback.filter(f => f.rating === 'negative').length;
  const total = feedback.length;

  return {
    positive,
    negative,
    total,
    satisfactionRate: Math.round((positive / total) * 100),
  };
}
