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
