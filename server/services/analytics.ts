import { supabaseAdmin, ConversationMessage } from "../utils/supabase";
import { getCache, setCache } from "../utils/redis";
import logger from "../utils/logger";

export interface DashboardStats {
  totalChatbots: number;
  activeChatbots: number;
  totalMessages: number;
  totalConversations: number;
  avgResponseTime: number | null;
}

export interface ConversationTrendPoint {
  date: string;
  conversations: number;
  messages: number;
}

export interface MessageVolumePoint {
  date: string;
  messages: number;
}

export interface TopQuestion {
  question: string;
  count: number;
  lastAsked: string;
}

export interface ChatbotAnalytics {
  chatbotId: string;
  totalConversations: number;
  totalMessages: number;
  avgMessagesPerConversation: number;
  avgResponseTime: number | null;
}

/**
 * Get dashboard statistics for a user
 */
export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const cacheKey = `analytics:dashboard:${userId}`;
  const cached = await getCache<DashboardStats>(cacheKey);

  if (cached) {
    return cached;
  }

  try {
    // Get total chatbots
    const { count: totalChatbots } = await supabaseAdmin
      .from("chatbots")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);

    // Get active chatbots (ready status)
    const { count: activeChatbots } = await supabaseAdmin
      .from("chatbots")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "ready");

    // Get user's chatbot IDs
    const { data: userChatbots } = await supabaseAdmin
      .from("chatbots")
      .select("id")
      .eq("user_id", userId);

    const chatbotIds = userChatbots?.map((c) => c.id) || [];

    let totalMessages = 0;
    let totalConversations = 0;
    let totalResponseTime = 0;
    let responseTimeCount = 0;

    if (chatbotIds.length > 0) {
      // Get conversations with messages
      const { data: conversations, count: convoCount } = await supabaseAdmin
        .from("conversations")
        .select("messages, created_at, updated_at", { count: "exact" })
        .in("chatbot_id", chatbotIds);

      totalConversations = convoCount || 0;

      // Process conversations for message count and response times
      if (conversations) {
        for (const conv of conversations) {
          const messages = conv.messages as ConversationMessage[];
          if (Array.isArray(messages)) {
            totalMessages += messages.length;

            // Calculate response times from message pairs
            for (let i = 1; i < messages.length; i++) {
              if (messages[i].role === "assistant" && messages[i - 1].role === "user") {
                const userTime = new Date(messages[i - 1].timestamp).getTime();
                const assistantTime = new Date(messages[i].timestamp).getTime();
                const responseTime = assistantTime - userTime;

                // Only count reasonable response times (< 60 seconds)
                if (responseTime > 0 && responseTime < 60000) {
                  totalResponseTime += responseTime;
                  responseTimeCount++;
                }
              }
            }
          }
        }
      }
    }

    const avgResponseTime = responseTimeCount > 0
      ? Math.round(totalResponseTime / responseTimeCount)
      : null;

    const stats: DashboardStats = {
      totalChatbots: totalChatbots || 0,
      activeChatbots: activeChatbots || 0,
      totalMessages,
      totalConversations,
      avgResponseTime,
    };

    // Cache for 5 minutes
    await setCache(cacheKey, stats, 300);

    return stats;
  } catch (error) {
    logger.error("Failed to get dashboard stats", { error, userId });
    throw new Error("Failed to get dashboard stats");
  }
}

/**
 * Get conversation trends for a specific chatbot over time
 */
export async function getConversationTrends(
  chatbotId: string,
  days: number = 7
): Promise<ConversationTrendPoint[]> {
  const cacheKey = `analytics:trends:${chatbotId}:${days}`;
  const cached = await getCache<ConversationTrendPoint[]>(cacheKey);

  if (cached) {
    return cached;
  }

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const { data: conversations } = await supabaseAdmin
      .from("conversations")
      .select("messages, created_at")
      .eq("chatbot_id", chatbotId)
      .gte("created_at", startDate.toISOString());

    // Initialize daily buckets
    const dailyData: Map<string, { conversations: number; messages: number }> = new Map();

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));
      const dateKey = date.toISOString().split("T")[0];
      dailyData.set(dateKey, { conversations: 0, messages: 0 });
    }

    // Aggregate conversations by day
    if (conversations) {
      for (const conv of conversations) {
        const dateKey = conv.created_at.split("T")[0];
        const existing = dailyData.get(dateKey);

        if (existing) {
          existing.conversations++;
          const messages = conv.messages as ConversationMessage[];
          existing.messages += Array.isArray(messages) ? messages.length : 0;
        }
      }
    }

    const trends: ConversationTrendPoint[] = Array.from(dailyData.entries()).map(
      ([date, data]) => ({
        date,
        conversations: data.conversations,
        messages: data.messages,
      })
    );

    // Cache for 5 minutes
    await setCache(cacheKey, trends, 300);

    return trends;
  } catch (error) {
    logger.error("Failed to get conversation trends", { error, chatbotId, days });
    throw new Error("Failed to get conversation trends");
  }
}

/**
 * Get message volume by day for all of a user's chatbots
 */
export async function getMessageVolumeByDay(
  userId: string,
  days: number = 7
): Promise<MessageVolumePoint[]> {
  const cacheKey = `analytics:volume:${userId}:${days}`;
  const cached = await getCache<MessageVolumePoint[]>(cacheKey);

  if (cached) {
    return cached;
  }

  try {
    // Get user's chatbot IDs
    const { data: userChatbots } = await supabaseAdmin
      .from("chatbots")
      .select("id")
      .eq("user_id", userId);

    const chatbotIds = userChatbots?.map((c) => c.id) || [];

    // Initialize daily buckets
    const dailyData: Map<string, number> = new Map();

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));
      const dateKey = date.toISOString().split("T")[0];
      dailyData.set(dateKey, 0);
    }

    if (chatbotIds.length > 0) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const { data: conversations } = await supabaseAdmin
        .from("conversations")
        .select("messages, created_at, updated_at")
        .in("chatbot_id", chatbotIds)
        .gte("updated_at", startDate.toISOString());

      // Count messages by the day they were sent
      if (conversations) {
        for (const conv of conversations) {
          const messages = conv.messages as ConversationMessage[];
          if (Array.isArray(messages)) {
            for (const msg of messages) {
              const msgDate = new Date(msg.timestamp);
              if (msgDate >= startDate) {
                const dateKey = msgDate.toISOString().split("T")[0];
                const existing = dailyData.get(dateKey);
                if (existing !== undefined) {
                  dailyData.set(dateKey, existing + 1);
                }
              }
            }
          }
        }
      }
    }

    const volume: MessageVolumePoint[] = Array.from(dailyData.entries()).map(
      ([date, messages]) => ({
        date,
        messages,
      })
    );

    // Cache for 5 minutes
    await setCache(cacheKey, volume, 300);

    return volume;
  } catch (error) {
    logger.error("Failed to get message volume", { error, userId, days });
    throw new Error("Failed to get message volume");
  }
}

/**
 * Get top questions asked to a chatbot
 */
export async function getTopQuestions(
  chatbotId: string,
  limit: number = 10
): Promise<TopQuestion[]> {
  const cacheKey = `analytics:questions:${chatbotId}:${limit}`;
  const cached = await getCache<TopQuestion[]>(cacheKey);

  if (cached) {
    return cached;
  }

  try {
    const { data: conversations } = await supabaseAdmin
      .from("conversations")
      .select("messages")
      .eq("chatbot_id", chatbotId)
      .order("created_at", { ascending: false })
      .limit(100); // Look at recent conversations

    // Extract and count user questions
    const questionCounts: Map<string, { count: number; lastAsked: string }> = new Map();

    if (conversations) {
      for (const conv of conversations) {
        const messages = conv.messages as ConversationMessage[];
        if (Array.isArray(messages)) {
          for (const msg of messages) {
            if (msg.role === "user") {
              // Normalize question (lowercase, trim)
              const normalized = msg.content.toLowerCase().trim();

              // Skip very short messages
              if (normalized.length < 10) continue;

              const existing = questionCounts.get(normalized);
              if (existing) {
                existing.count++;
                if (new Date(msg.timestamp) > new Date(existing.lastAsked)) {
                  existing.lastAsked = msg.timestamp;
                }
              } else {
                questionCounts.set(normalized, {
                  count: 1,
                  lastAsked: msg.timestamp,
                });
              }
            }
          }
        }
      }
    }

    // Sort by count and take top N
    const topQuestions: TopQuestion[] = Array.from(questionCounts.entries())
      .map(([question, data]) => ({
        question: question.length > 100 ? question.substring(0, 100) + "..." : question,
        count: data.count,
        lastAsked: data.lastAsked,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    // Cache for 10 minutes
    await setCache(cacheKey, topQuestions, 600);

    return topQuestions;
  } catch (error) {
    logger.error("Failed to get top questions", { error, chatbotId, limit });
    throw new Error("Failed to get top questions");
  }
}

/**
 * Get average response time for a chatbot (in milliseconds)
 */
export async function getAverageResponseTime(chatbotId: string): Promise<number | null> {
  const cacheKey = `analytics:responsetime:${chatbotId}`;
  const cached = await getCache<number | null>(cacheKey);

  if (cached !== null) {
    return cached;
  }

  try {
    const { data: conversations } = await supabaseAdmin
      .from("conversations")
      .select("messages")
      .eq("chatbot_id", chatbotId)
      .order("created_at", { ascending: false })
      .limit(50); // Look at recent conversations

    let totalResponseTime = 0;
    let responseCount = 0;

    if (conversations) {
      for (const conv of conversations) {
        const messages = conv.messages as ConversationMessage[];
        if (Array.isArray(messages)) {
          for (let i = 1; i < messages.length; i++) {
            if (messages[i].role === "assistant" && messages[i - 1].role === "user") {
              const userTime = new Date(messages[i - 1].timestamp).getTime();
              const assistantTime = new Date(messages[i].timestamp).getTime();
              const responseTime = assistantTime - userTime;

              // Only count reasonable response times (< 60 seconds, > 0)
              if (responseTime > 0 && responseTime < 60000) {
                totalResponseTime += responseTime;
                responseCount++;
              }
            }
          }
        }
      }
    }

    const avgResponseTime = responseCount > 0
      ? Math.round(totalResponseTime / responseCount)
      : null;

    // Cache for 5 minutes
    await setCache(cacheKey, avgResponseTime, 300);

    return avgResponseTime;
  } catch (error) {
    logger.error("Failed to get average response time", { error, chatbotId });
    throw new Error("Failed to get average response time");
  }
}

/**
 * Get detailed analytics for a specific chatbot
 */
export async function getChatbotAnalytics(chatbotId: string): Promise<ChatbotAnalytics> {
  const cacheKey = `analytics:chatbot:${chatbotId}`;
  const cached = await getCache<ChatbotAnalytics>(cacheKey);

  if (cached) {
    return cached;
  }

  try {
    const { data: conversations, count: totalConversations } = await supabaseAdmin
      .from("conversations")
      .select("messages", { count: "exact" })
      .eq("chatbot_id", chatbotId);

    let totalMessages = 0;
    let totalResponseTime = 0;
    let responseCount = 0;

    if (conversations) {
      for (const conv of conversations) {
        const messages = conv.messages as ConversationMessage[];
        if (Array.isArray(messages)) {
          totalMessages += messages.length;

          for (let i = 1; i < messages.length; i++) {
            if (messages[i].role === "assistant" && messages[i - 1].role === "user") {
              const userTime = new Date(messages[i - 1].timestamp).getTime();
              const assistantTime = new Date(messages[i].timestamp).getTime();
              const responseTime = assistantTime - userTime;

              if (responseTime > 0 && responseTime < 60000) {
                totalResponseTime += responseTime;
                responseCount++;
              }
            }
          }
        }
      }
    }

    const analytics: ChatbotAnalytics = {
      chatbotId,
      totalConversations: totalConversations || 0,
      totalMessages,
      avgMessagesPerConversation: totalConversations
        ? Math.round((totalMessages / totalConversations) * 10) / 10
        : 0,
      avgResponseTime: responseCount > 0
        ? Math.round(totalResponseTime / responseCount)
        : null,
    };

    // Cache for 5 minutes
    await setCache(cacheKey, analytics, 300);

    return analytics;
  } catch (error) {
    logger.error("Failed to get chatbot analytics", { error, chatbotId });
    throw new Error("Failed to get chatbot analytics");
  }
}

/**
 * Invalidate analytics cache for a user (call after new messages)
 */
export async function invalidateAnalyticsCache(userId: string): Promise<void> {
  try {
    const { deleteCachePattern } = await import("../utils/redis");
    await deleteCachePattern(`analytics:*:${userId}:*`);
    await deleteCachePattern(`analytics:dashboard:${userId}`);
  } catch (error) {
    logger.error("Failed to invalidate analytics cache", { error, userId });
  }
}

/**
 * Invalidate chatbot-specific analytics cache
 */
export async function invalidateChatbotAnalyticsCache(chatbotId: string): Promise<void> {
  try {
    const { deleteCachePattern } = await import("../utils/redis");
    await deleteCachePattern(`analytics:*:${chatbotId}:*`);
    await deleteCachePattern(`analytics:chatbot:${chatbotId}`);
  } catch (error) {
    logger.error("Failed to invalidate chatbot analytics cache", { error, chatbotId });
  }
}

export interface SentimentBreakdown {
  positive: number;
  neutral: number;
  negative: number;
  total: number;
  positiveRate: number | null;
  negativeRate: number | null;
}

/**
 * Get sentiment breakdown for a chatbot
 */
export async function getSentimentBreakdown(chatbotId: string): Promise<SentimentBreakdown> {
  const cacheKey = `analytics:sentiment:${chatbotId}`;
  const cached = await getCache<SentimentBreakdown>(cacheKey);

  if (cached) {
    return cached;
  }

  try {
    const { data: conversations } = await supabaseAdmin
      .from("conversations")
      .select("messages")
      .eq("chatbot_id", chatbotId);

    let positive = 0;
    let neutral = 0;
    let negative = 0;

    if (conversations) {
      for (const conv of conversations) {
        const messages = conv.messages as ConversationMessage[];
        if (Array.isArray(messages)) {
          for (const msg of messages) {
            if (msg.role === "user" && msg.sentiment) {
              if (msg.sentiment === "positive") positive++;
              else if (msg.sentiment === "negative") negative++;
              else neutral++;
            }
          }
        }
      }
    }

    const total = positive + neutral + negative;
    const breakdown: SentimentBreakdown = {
      positive,
      neutral,
      negative,
      total,
      positiveRate: total > 0 ? Math.round((positive / total) * 100) : null,
      negativeRate: total > 0 ? Math.round((negative / total) * 100) : null,
    };

    // Cache for 5 minutes
    await setCache(cacheKey, breakdown, 300);

    return breakdown;
  } catch (error) {
    logger.error("Failed to get sentiment breakdown", { error, chatbotId });
    throw new Error("Failed to get sentiment breakdown");
  }
}

export interface SatisfactionMetrics {
  positive: number;
  negative: number;
  total: number;
  satisfactionRate: number | null;
}

/**
 * Get CSAT satisfaction metrics for a chatbot
 */
export async function getSatisfactionMetrics(chatbotId: string): Promise<SatisfactionMetrics> {
  const cacheKey = `analytics:satisfaction:${chatbotId}`;
  const cached = await getCache<SatisfactionMetrics>(cacheKey);

  if (cached) {
    return cached;
  }

  try {
    const { data: feedbackData, error } = await supabaseAdmin
      .from("feedback")
      .select("rating")
      .eq("chatbot_id", chatbotId);

    if (error) {
      logger.error("Failed to get feedback", { error, chatbotId });
      throw new Error("Failed to get feedback");
    }

    const feedback = feedbackData || [];
    const positive = feedback.filter((f) => f.rating === "positive").length;
    const negative = feedback.filter((f) => f.rating === "negative").length;
    const total = feedback.length;

    const metrics: SatisfactionMetrics = {
      positive,
      negative,
      total,
      satisfactionRate: total > 0 ? Math.round((positive / total) * 100) : null,
    };

    // Cache for 5 minutes
    await setCache(cacheKey, metrics, 300);

    return metrics;
  } catch (error) {
    logger.error("Failed to get satisfaction metrics", { error, chatbotId });
    throw new Error("Failed to get satisfaction metrics");
  }
}

export interface SentimentTrendPoint {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
}

/**
 * Get sentiment trends over time for a chatbot
 */
export async function getSentimentTrends(
  chatbotId: string,
  days: number = 7
): Promise<SentimentTrendPoint[]> {
  const cacheKey = `analytics:sentiment-trends:${chatbotId}:${days}`;
  const cached = await getCache<SentimentTrendPoint[]>(cacheKey);

  if (cached) {
    return cached;
  }

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const { data: conversations } = await supabaseAdmin
      .from("conversations")
      .select("messages, created_at")
      .eq("chatbot_id", chatbotId)
      .gte("created_at", startDate.toISOString());

    // Initialize daily buckets
    const dailyData: Map<string, { positive: number; neutral: number; negative: number }> = new Map();

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));
      const dateKey = date.toISOString().split("T")[0];
      dailyData.set(dateKey, { positive: 0, neutral: 0, negative: 0 });
    }

    // Aggregate sentiment by day
    if (conversations) {
      for (const conv of conversations) {
        const dateKey = conv.created_at.split("T")[0];
        const existing = dailyData.get(dateKey);

        if (existing) {
          const messages = conv.messages as ConversationMessage[];
          if (Array.isArray(messages)) {
            for (const msg of messages) {
              if (msg.role === "user" && msg.sentiment) {
                if (msg.sentiment === "positive") existing.positive++;
                else if (msg.sentiment === "negative") existing.negative++;
                else existing.neutral++;
              }
            }
          }
        }
      }
    }

    const trends: SentimentTrendPoint[] = Array.from(dailyData.entries()).map(
      ([date, data]) => ({
        date,
        positive: data.positive,
        neutral: data.neutral,
        negative: data.negative,
      })
    );

    // Cache for 5 minutes
    await setCache(cacheKey, trends, 300);

    return trends;
  } catch (error) {
    logger.error("Failed to get sentiment trends", { error, chatbotId, days });
    throw new Error("Failed to get sentiment trends");
  }
}

// ==================== Phase 5: New Analytics Metrics ====================

export interface ConversationRateMetrics {
  widgetViews: number;
  widgetOpens: number;
  conversationsStarted: number;
  conversionRate: number;
  openRate: number;
}

export interface ResponseTimeTrendPoint {
  date: string;
  avgResponseTimeMs: number;
  messageCount: number;
}

export interface ChatbotComparisonItem {
  chatbotId: string;
  chatbotName: string;
  totalMessages: number;
  totalConversations: number;
  csatScore: number | null;
  avgResponseTimeMs: number | null;
  conversionRate: number | null;
}

export interface AnalyticsExportData {
  chatbot: {
    id: string;
    name: string;
    websiteUrl: string;
    createdAt: string;
  };
  summary: {
    totalConversations: number;
    totalMessages: number;
    avgMessagesPerConversation: number;
    avgResponseTimeMs: number | null;
    csatScore: number | null;
    conversionRate: number | null;
  };
  conversations: Array<{
    id: string;
    sessionId: string;
    createdAt: string;
    messageCount: number;
    messages: Array<{
      role: string;
      content: string;
      timestamp: string;
      sentiment?: string;
    }>;
    rating?: string;
  }>;
  dateRange: {
    start: string;
    end: string;
  };
  exportedAt: string;
}

/**
 * Get conversation rate metrics (widget views vs conversations started)
 */
export async function getConversationRate(
  chatbotId: string,
  days: number = 30
): Promise<ConversationRateMetrics> {
  const cacheKey = `analytics:convrate:${chatbotId}:${days}`;
  const cached = await getCache<ConversationRateMetrics>(cacheKey);

  if (cached) {
    return cached;
  }

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    // Get widget analytics events
    const { data: widgetEvents } = await supabaseAdmin
      .from("widget_analytics")
      .select("event_type")
      .eq("chatbot_id", chatbotId)
      .gte("timestamp", startDate.toISOString());

    const events = widgetEvents || [];
    const widgetViews = events.filter((e) => e.event_type === "view").length;
    const widgetOpens = events.filter((e) => e.event_type === "open").length;
    const conversationsStarted = events.filter((e) => e.event_type === "first_message").length;

    // Calculate rates
    const conversionRate = widgetViews > 0
      ? Math.round((conversationsStarted / widgetViews) * 10000) / 100
      : 0;
    const openRate = widgetViews > 0
      ? Math.round((widgetOpens / widgetViews) * 10000) / 100
      : 0;

    const metrics: ConversationRateMetrics = {
      widgetViews,
      widgetOpens,
      conversationsStarted,
      conversionRate,
      openRate,
    };

    // Cache for 5 minutes
    await setCache(cacheKey, metrics, 300);

    return metrics;
  } catch (error) {
    logger.error("Failed to get conversation rate", { error, chatbotId, days });
    // Return empty metrics instead of throwing for graceful degradation
    return {
      widgetViews: 0,
      widgetOpens: 0,
      conversationsStarted: 0,
      conversionRate: 0,
      openRate: 0,
    };
  }
}

/**
 * Get response time trends over time
 */
export async function getResponseTimeTrends(
  chatbotId: string,
  days: number = 7
): Promise<ResponseTimeTrendPoint[]> {
  const cacheKey = `analytics:responsetime-trends:${chatbotId}:${days}`;
  const cached = await getCache<ResponseTimeTrendPoint[]>(cacheKey);

  if (cached) {
    return cached;
  }

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const { data: conversations } = await supabaseAdmin
      .from("conversations")
      .select("messages, created_at")
      .eq("chatbot_id", chatbotId)
      .gte("created_at", startDate.toISOString());

    // Initialize daily buckets
    const dailyData: Map<string, { totalResponseTime: number; responseCount: number }> = new Map();

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));
      const dateKey = date.toISOString().split("T")[0];
      dailyData.set(dateKey, { totalResponseTime: 0, responseCount: 0 });
    }

    // Calculate response times by day
    if (conversations) {
      for (const conv of conversations) {
        const dateKey = conv.created_at.split("T")[0];
        const existing = dailyData.get(dateKey);

        if (existing) {
          const messages = conv.messages as ConversationMessage[];
          if (Array.isArray(messages)) {
            for (let i = 1; i < messages.length; i++) {
              if (messages[i].role === "assistant" && messages[i - 1].role === "user") {
                const userTime = new Date(messages[i - 1].timestamp).getTime();
                const assistantTime = new Date(messages[i].timestamp).getTime();
                const responseTime = assistantTime - userTime;

                // Only count reasonable response times (< 60 seconds, > 0)
                if (responseTime > 0 && responseTime < 60000) {
                  existing.totalResponseTime += responseTime;
                  existing.responseCount++;
                }
              }
            }
          }
        }
      }
    }

    const trends: ResponseTimeTrendPoint[] = Array.from(dailyData.entries()).map(
      ([date, data]) => ({
        date,
        avgResponseTimeMs: data.responseCount > 0
          ? Math.round(data.totalResponseTime / data.responseCount)
          : 0,
        messageCount: data.responseCount,
      })
    );

    // Cache for 5 minutes
    await setCache(cacheKey, trends, 300);

    return trends;
  } catch (error) {
    logger.error("Failed to get response time trends", { error, chatbotId, days });
    throw new Error("Failed to get response time trends");
  }
}

/**
 * Compare all chatbots for a user
 */
export async function compareChatbots(userId: string): Promise<ChatbotComparisonItem[]> {
  const cacheKey = `analytics:compare:${userId}`;
  const cached = await getCache<ChatbotComparisonItem[]>(cacheKey);

  if (cached) {
    return cached;
  }

  try {
    // Get all user's chatbots
    const { data: chatbots } = await supabaseAdmin
      .from("chatbots")
      .select("id, name, website_url, status")
      .eq("user_id", userId)
      .eq("status", "ready");

    if (!chatbots || chatbots.length === 0) {
      return [];
    }

    const comparisons: ChatbotComparisonItem[] = [];

    for (const chatbot of chatbots) {
      // Get analytics for each chatbot
      const [analytics, satisfaction, conversionRate] = await Promise.all([
        getChatbotAnalytics(chatbot.id),
        getSatisfactionMetrics(chatbot.id),
        getConversationRate(chatbot.id, 30),
      ]);

      comparisons.push({
        chatbotId: chatbot.id,
        chatbotName: chatbot.name,
        totalMessages: analytics.totalMessages,
        totalConversations: analytics.totalConversations,
        csatScore: satisfaction.satisfactionRate,
        avgResponseTimeMs: analytics.avgResponseTime,
        conversionRate: conversionRate.conversionRate,
      });
    }

    // Sort by message volume descending
    comparisons.sort((a, b) => b.totalMessages - a.totalMessages);

    // Cache for 5 minutes
    await setCache(cacheKey, comparisons, 300);

    return comparisons;
  } catch (error) {
    logger.error("Failed to compare chatbots", { error, userId });
    throw new Error("Failed to compare chatbots");
  }
}

/**
 * Export analytics data for a chatbot
 */
export async function exportAnalytics(
  chatbotId: string,
  format: "csv" | "json",
  options: {
    startDate?: string;
    endDate?: string;
    includeConversations?: boolean;
    includeMessages?: boolean;
    includeRatings?: boolean;
  } = {}
): Promise<AnalyticsExportData | string> {
  try {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      endDate = new Date().toISOString(),
      includeConversations = true,
      includeMessages = true,
      includeRatings = true,
    } = options;

    // Get chatbot details
    const { data: chatbot, error: chatbotError } = await supabaseAdmin
      .from("chatbots")
      .select("id, name, website_url, created_at")
      .eq("id", chatbotId)
      .single();

    if (chatbotError || !chatbot) {
      throw new Error("Chatbot not found");
    }

    // Get analytics summary
    const analytics = await getChatbotAnalytics(chatbotId);
    const satisfaction = await getSatisfactionMetrics(chatbotId);
    const conversionRate = await getConversationRate(chatbotId, 30);

    // Get conversations
    let conversationsData: AnalyticsExportData["conversations"] = [];

    if (includeConversations) {
      const { data: conversations } = await supabaseAdmin
        .from("conversations")
        .select("id, session_id, messages, created_at")
        .eq("chatbot_id", chatbotId)
        .gte("created_at", startDate)
        .lte("created_at", endDate)
        .order("created_at", { ascending: false });

      // Get feedback for all conversations
      let feedbackMap: Map<string, string> = new Map();
      if (includeRatings && conversations) {
        const conversationIds = conversations.map((c) => c.id);
        const { data: feedbackData } = await supabaseAdmin
          .from("feedback")
          .select("conversation_id, rating")
          .in("conversation_id", conversationIds);

        if (feedbackData) {
          feedbackMap = new Map(feedbackData.map((f) => [f.conversation_id, f.rating]));
        }
      }

      conversationsData = (conversations || []).map((conv) => {
        const messages = conv.messages as ConversationMessage[];
        return {
          id: conv.id,
          sessionId: conv.session_id,
          createdAt: conv.created_at,
          messageCount: Array.isArray(messages) ? messages.length : 0,
          messages: includeMessages && Array.isArray(messages)
            ? messages.map((m) => ({
                role: m.role,
                content: m.content,
                timestamp: m.timestamp,
                sentiment: m.sentiment,
              }))
            : [],
          rating: feedbackMap.get(conv.id),
        };
      });
    }

    const exportData: AnalyticsExportData = {
      chatbot: {
        id: chatbot.id,
        name: chatbot.name,
        websiteUrl: chatbot.website_url,
        createdAt: chatbot.created_at,
      },
      summary: {
        totalConversations: analytics.totalConversations,
        totalMessages: analytics.totalMessages,
        avgMessagesPerConversation: analytics.avgMessagesPerConversation,
        avgResponseTimeMs: analytics.avgResponseTime,
        csatScore: satisfaction.satisfactionRate,
        conversionRate: conversionRate.conversionRate,
      },
      conversations: conversationsData,
      dateRange: {
        start: startDate,
        end: endDate,
      },
      exportedAt: new Date().toISOString(),
    };

    if (format === "json") {
      return exportData;
    }

    // Convert to CSV
    return convertToCSV(exportData);
  } catch (error) {
    logger.error("Failed to export analytics", { error, chatbotId, format });
    throw new Error("Failed to export analytics");
  }
}

/**
 * Convert analytics data to CSV format
 */
function convertToCSV(data: AnalyticsExportData): string {
  const lines: string[] = [];

  // Add header section
  lines.push("# Chatbot Analytics Export");
  lines.push(`# Exported at: ${data.exportedAt}`);
  lines.push(`# Date Range: ${data.dateRange.start} to ${data.dateRange.end}`);
  lines.push("");

  // Add chatbot info
  lines.push("## Chatbot Information");
  lines.push("Field,Value");
  lines.push(`Name,"${data.chatbot.name}"`);
  lines.push(`ID,${data.chatbot.id}`);
  lines.push(`Website URL,"${data.chatbot.websiteUrl}"`);
  lines.push(`Created At,${data.chatbot.createdAt}`);
  lines.push("");

  // Add summary
  lines.push("## Summary");
  lines.push("Metric,Value");
  lines.push(`Total Conversations,${data.summary.totalConversations}`);
  lines.push(`Total Messages,${data.summary.totalMessages}`);
  lines.push(`Avg Messages Per Conversation,${data.summary.avgMessagesPerConversation}`);
  lines.push(`Avg Response Time (ms),${data.summary.avgResponseTimeMs || "N/A"}`);
  lines.push(`CSAT Score (%),${data.summary.csatScore || "N/A"}`);
  lines.push(`Conversion Rate (%),${data.summary.conversionRate || "N/A"}`);
  lines.push("");

  // Add conversations
  if (data.conversations.length > 0) {
    lines.push("## Conversations");
    lines.push("Conversation ID,Session ID,Created At,Message Count,Rating");

    for (const conv of data.conversations) {
      const rating = conv.rating || "N/A";
      lines.push(`${conv.id},${conv.sessionId},${conv.createdAt},${conv.messageCount},${rating}`);
    }
    lines.push("");

    // Add messages
    const hasMessages = data.conversations.some((c) => c.messages.length > 0);
    if (hasMessages) {
      lines.push("## Messages");
      lines.push("Conversation ID,Role,Timestamp,Sentiment,Content");

      for (const conv of data.conversations) {
        for (const msg of conv.messages) {
          const content = msg.content.replace(/"/g, '""').replace(/\n/g, " ");
          const sentiment = msg.sentiment || "N/A";
          lines.push(`${conv.id},${msg.role},${msg.timestamp},${sentiment},"${content}"`);
        }
      }
    }
  }

  return lines.join("\n");
}

/**
 * Track widget analytics event
 */
export async function trackWidgetEvent(
  chatbotId: string,
  eventType: "view" | "open" | "close" | "message" | "first_message",
  sessionId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await supabaseAdmin.from("widget_analytics").insert({
      chatbot_id: chatbotId,
      event_type: eventType,
      session_id: sessionId,
      metadata: metadata || {},
    });
  } catch (error) {
    // Don't throw, just log - analytics should not break the main flow
    logger.error("Failed to track widget event", { error, chatbotId, eventType });
  }
}

/**
 * Get widget analytics summary
 */
export async function getWidgetAnalyticsSummary(
  chatbotId: string,
  days: number = 7
): Promise<{
  dailyViews: Array<{ date: string; views: number; opens: number; messages: number }>;
  totalViews: number;
  totalOpens: number;
  totalMessages: number;
}> {
  const cacheKey = `analytics:widget-summary:${chatbotId}:${days}`;
  const cached = await getCache<{
    dailyViews: Array<{ date: string; views: number; opens: number; messages: number }>;
    totalViews: number;
    totalOpens: number;
    totalMessages: number;
  }>(cacheKey);

  if (cached) {
    return cached;
  }

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const { data: events } = await supabaseAdmin
      .from("widget_analytics")
      .select("event_type, timestamp")
      .eq("chatbot_id", chatbotId)
      .gte("timestamp", startDate.toISOString());

    // Initialize daily buckets
    const dailyData: Map<string, { views: number; opens: number; messages: number }> = new Map();

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));
      const dateKey = date.toISOString().split("T")[0];
      dailyData.set(dateKey, { views: 0, opens: 0, messages: 0 });
    }

    let totalViews = 0;
    let totalOpens = 0;
    let totalMessages = 0;

    if (events) {
      for (const event of events) {
        const dateKey = event.timestamp.split("T")[0];
        const existing = dailyData.get(dateKey);

        if (event.event_type === "view") {
          totalViews++;
          if (existing) existing.views++;
        } else if (event.event_type === "open") {
          totalOpens++;
          if (existing) existing.opens++;
        } else if (event.event_type === "message" || event.event_type === "first_message") {
          totalMessages++;
          if (existing) existing.messages++;
        }
      }
    }

    const summary = {
      dailyViews: Array.from(dailyData.entries()).map(([date, data]) => ({
        date,
        views: data.views,
        opens: data.opens,
        messages: data.messages,
      })),
      totalViews,
      totalOpens,
      totalMessages,
    };

    // Cache for 5 minutes
    await setCache(cacheKey, summary, 300);

    return summary;
  } catch (error) {
    logger.error("Failed to get widget analytics summary", { error, chatbotId, days });
    return {
      dailyViews: [],
      totalViews: 0,
      totalOpens: 0,
      totalMessages: 0,
    };
  }
}
