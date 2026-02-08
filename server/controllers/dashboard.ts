import { Response, NextFunction } from "express";
import { supabaseAdmin } from "../utils/supabase";
import { AuthenticatedRequest } from "../middleware/clerkAuth";
import { AuthorizationError } from "../utils/errors";
import logger from "../utils/logger";

/**
 * Dashboard-ийн нэгдсэн өгөгдөл авах endpoint
 * Бүх query-г зэрэгцээ (parallel) ажиллуулж, chatbot ID-г нэг удаа татна
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

    // Chatbot мэдээллийг НЭГ удаа татаж, бусад функцүүдэд дамжуулна
    // Ингэснээр давхардсан 3 query-г 1 болгоно
    const { data: userChatbots } = await supabaseAdmin
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

    const chatbots = userChatbots || [];
    const chatbotIds = chatbots.map(c => c.id);

    // Эхний идэвхтэй chatbot-г олох (sentiment + satisfaction-д хэрэгтэй)
    const firstActiveBot = chatbots.find(c => c.status === "ready");

    // Бүх query-г зэрэгцээ ажиллуулна
    const [
      statsResult,
      messageVolumeResult,
      comparisonResult,
      firstBotDataResult
    ] = await Promise.allSettled([
      getStats(chatbots, chatbotIds),
      getMessageVolume(chatbotIds, days),
      getChatbotComparison(chatbots, chatbotIds),
      getFirstBotData(firstActiveBot?.id || null)
    ]);

    // Үр дүнг fallback утгуудтай задлах
    const stats = statsResult.status === 'fulfilled' ? statsResult.value : getDefaultStats();
    const messageVolume = messageVolumeResult.status === 'fulfilled' ? messageVolumeResult.value : [];
    const chatbotComparison = comparisonResult.status === 'fulfilled' ? comparisonResult.value : [];
    const firstBotData = firstBotDataResult.status === 'fulfilled' ? firstBotDataResult.value : null;

    // Алдааг бүртгэх (хариуг бүтэлгүйтүүлэхгүй)
    const results = [
      { name: 'stats', result: statsResult },
      { name: 'messageVolume', result: messageVolumeResult },
      { name: 'comparison', result: comparisonResult },
      { name: 'firstBotData', result: firstBotDataResult }
    ];
    for (const { name, result } of results) {
      if (result.status === 'rejected') {
        logger.warn(`Dashboard ${name} татахад алдаа`, { error: result.reason, userId });
      }
    }

    logger.info('Dashboard overview fetched', { userId, days });

    res.json({
      stats,
      chatbots,
      messageVolume,
      chatbotComparison,
      sentiment: firstBotData?.sentiment || null,
      satisfaction: firstBotData?.satisfaction || null
    });
  } catch (error) {
    logger.error('Dashboard overview error', { error, userId: req.user?.userId });
    next(error);
  }
}

/**
 * Хэрэглэгчийн статистик авах
 * Аль хэдийн татсан chatbot-уудын мэдээлэл дээр ажиллана
 *
 * Оновчлол: 5 sequential query → 2 parallel query
 * - chatbots дээрээс total/active-г шууд тоолно (query хэмнэнэ)
 * - conversations count + message count-г parallel хийнэ
 */
async function getStats(chatbots: any[], chatbotIds: string[]) {
  const totalChatbots = chatbots.length;
  const activeChatbots = chatbots.filter(c => c.status === "ready").length;

  if (chatbotIds.length === 0) {
    return {
      totalChatbots,
      activeChatbots,
      totalMessages: 0,
      totalConversations: 0,
      avgResponseTime: null,
    };
  }

  // Conversation count болон message count-г зэрэгцээ авна
  const [convCountResult, convMessagesResult] = await Promise.all([
    // Нийт conversation тоо (head: true → зөвхөн count буцаана, өгөгдөл татахгүй)
    supabaseAdmin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .in("chatbot_id", chatbotIds),
    // Message тоолохдоо зөвхөн messages массивын уртыг авна
    // JSONB бүтнээр нь татахын оронд messages field-г л авна
    supabaseAdmin
      .from("conversations")
      .select("messages")
      .in("chatbot_id", chatbotIds)
  ]);

  const totalConversations = convCountResult.count || 0;

  // Messages тоолох — JSONB массивын элемент бүрийг тоолно
  const totalMessages = convMessagesResult.data?.reduce((sum, conv) => {
    return sum + (Array.isArray(conv.messages) ? conv.messages.length : 0);
  }, 0) || 0;

  return {
    totalChatbots,
    activeChatbots,
    totalMessages,
    totalConversations,
    avgResponseTime: null,
  };
}

/** Статистикийн анхдагч утгууд */
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
 * Мессежийн хэмжээг хугацаагаар авах
 *
 * Оновчлол: chatbot ID-г дахин татахгүй (параметрээр авна)
 */
async function getMessageVolume(chatbotIds: string[], days: number) {
  if (chatbotIds.length === 0) {
    return buildEmptyVolume(days);
  }

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Хугацааны доторх conversations + messages авах
  const { data: conversations } = await supabaseAdmin
    .from("conversations")
    .select("messages, created_at")
    .in("chatbot_id", chatbotIds)
    .gte("created_at", startDate.toISOString())
    .lte("created_at", endDate.toISOString());

  // Мессежүүдийг огноогоор бүлэглэх
  const messagesByDate = new Map<string, number>();

  conversations?.forEach(conv => {
    if (Array.isArray(conv.messages)) {
      conv.messages.forEach((msg: any) => {
        const msgDate = new Date(msg.timestamp).toISOString().split('T')[0];
        messagesByDate.set(msgDate, (messagesByDate.get(msgDate) || 0) + 1);
      });
    }
  });

  return buildVolumeArray(days, messagesByDate);
}

/** Хоосон хугацааны массив үүсгэх */
function buildEmptyVolume(days: number) {
  return buildVolumeArray(days, new Map());
}

/** Огноогоор эрэмбэлсэн volume массив үүсгэх */
function buildVolumeArray(days: number, messagesByDate: Map<string, number>) {
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
 * Chatbot-уудын харьцуулалтын өгөгдөл
 *
 * Оновчлол (N+1 query засав):
 *   Өмнө: chatbot бүрт 2 query (conversations + feedback) = 1 + N*2 query
 *   Одоо: бүгдийг 2 bulk query-ээр авч, JS дээр бүлэглэнэ = 3 query (тогтмол)
 *
 * Жишээ: 10 chatbot → өмнө 21 query, одоо 3 query
 */
async function getChatbotComparison(chatbots: any[], chatbotIds: string[]) {
  if (chatbots.length === 0) {
    return [];
  }

  // Бүх conversations болон feedback-г НЭГЭН ЗЭРЭГ bulk query-ээр авна
  const [allConversations, allFeedback] = await Promise.all([
    supabaseAdmin
      .from("conversations")
      .select("chatbot_id, messages")
      .in("chatbot_id", chatbotIds),
    supabaseAdmin
      .from("feedback")
      .select("chatbot_id, rating")
      .in("chatbot_id", chatbotIds)
  ]);

  // Conversations-г chatbot_id-аар бүлэглэх (Map ашиглан хурдан хайлт)
  const convByBot = new Map<string, { msgCount: number; convCount: number }>();
  allConversations.data?.forEach(conv => {
    const current = convByBot.get(conv.chatbot_id) || { msgCount: 0, convCount: 0 };
    current.convCount++;
    current.msgCount += Array.isArray(conv.messages) ? conv.messages.length : 0;
    convByBot.set(conv.chatbot_id, current);
  });

  // Feedback-г chatbot_id-аар бүлэглэх
  const feedbackByBot = new Map<string, { positive: number; total: number }>();
  allFeedback.data?.forEach(fb => {
    const current = feedbackByBot.get(fb.chatbot_id) || { positive: 0, total: 0 };
    current.total++;
    if (fb.rating === 'positive') current.positive++;
    feedbackByBot.set(fb.chatbot_id, current);
  });

  // Chatbot бүрийн харьцуулалтыг нэгтгэх
  return chatbots.map(bot => {
    const convData = convByBot.get(bot.id) || { msgCount: 0, convCount: 0 };
    const fbData = feedbackByBot.get(bot.id);

    let csatScore = null;
    if (fbData && fbData.total > 0) {
      csatScore = Math.round((fbData.positive / fbData.total) * 100);
    }

    return {
      chatbotId: bot.id,
      chatbotName: bot.name,
      totalMessages: convData.msgCount,
      totalConversations: convData.convCount,
      csatScore,
      avgResponseTimeMs: null,
      conversionRate: null,
    };
  });
}

/**
 * Эхний идэвхтэй chatbot-ын sentiment + satisfaction өгөгдөл
 *
 * Оновчлол: Өмнө 2 тусдаа функц байсан → нэгтгэсэн
 * Хоёулаа ижил chatbot-ын өгөгдлийг ашигладаг тул нэг функцэд нийлүүлсэн
 */
async function getFirstBotData(chatbotId: string | null) {
  if (!chatbotId) {
    return { sentiment: null, satisfaction: null };
  }

  // Conversations + feedback-г зэрэгцээ авна
  const [convResult, feedbackResult] = await Promise.all([
    supabaseAdmin
      .from("conversations")
      .select("messages")
      .eq("chatbot_id", chatbotId),
    supabaseAdmin
      .from("feedback")
      .select("rating")
      .eq("chatbot_id", chatbotId)
  ]);

  // Sentiment тооцоолох — messages дотор sentiment field шалгана
  let sentiment = null;
  const conversations = convResult.data;
  if (conversations && conversations.length > 0) {
    let positive = 0, neutral = 0, negative = 0, total = 0;

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

    if (total > 0) {
      sentiment = {
        positive,
        neutral,
        negative,
        total,
        positiveRate: Math.round((positive / total) * 100),
        negativeRate: Math.round((negative / total) * 100),
      };
    }
  }

  // Satisfaction тооцоолох — feedback дээр ажиллана
  let satisfaction = null;
  const feedback = feedbackResult.data;
  if (feedback && feedback.length > 0) {
    const positiveCount = feedback.filter(f => f.rating === 'positive').length;
    const negativeCount = feedback.filter(f => f.rating === 'negative').length;
    const totalCount = feedback.length;

    satisfaction = {
      positive: positiveCount,
      negative: negativeCount,
      total: totalCount,
      satisfactionRate: Math.round((positiveCount / totalCount) * 100),
    };
  }

  return { sentiment, satisfaction };
}
