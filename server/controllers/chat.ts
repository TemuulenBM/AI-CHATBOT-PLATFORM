import { Request, Response, NextFunction } from "express";
import { supabaseAdmin, ConversationMessage, ChatbotSettings } from "../utils/supabase";
import { AuthenticatedRequest, checkAndIncrementUsage, decrementUsage } from "../middleware/clerkAuth";
import { NotFoundError, ValidationError, AuthorizationError } from "../utils/errors";
import { ChatMessageInput } from "../middleware/validation";
import { aiService, requiresMaxCompletionTokens } from "../services/ai";
import { analyzeSentiment } from "../services/sentiment";
import { supportBotConfig, buildSupportBotPrompt } from "../config/support-bot.config";
import { getCache, setCache } from "../utils/redis";
import logger from "../utils/logger";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Conversation-д хадгалах хамгийн их message тоо
// Яагаад: JSONB array хязгааргүй өсвөл DB storage, query speed, network payload бүгд нэмэгдэнэ
// 100 message = ~50 user + 50 assistant pair — ихэнх use case-д хангалттай
const MAX_STORED_MESSAGES = 100;

// System prompt for built-in ConvoAI support bot - KERNEL framework
// Generated from config for easy maintenance
const SUPPORT_BOT_SYSTEM_PROMPT = buildSupportBotPrompt(supportBotConfig);

// Support bot conversation-ыг Redis-д хадгална (24 цагийн TTL)
// Яагаад: In-memory Map нь server restart-д алдагдана, horizontal scaling-д ажиллахгүй,
// мөн хязгааргүй өсч memory leak үүсгэнэ
const SUPPORT_CONVERSATION_TTL = 86400; // 24 цаг (секундээр)
const SUPPORT_CONVERSATION_PREFIX = "support_conv:";

/**
 * Redis-с support bot conversation history авах
 */
async function getSupportConversation(sessionId: string): Promise<ConversationMessage[]> {
  const data = await getCache<ConversationMessage[]>(`${SUPPORT_CONVERSATION_PREFIX}${sessionId}`);
  return data || [];
}

/**
 * Redis-д support bot conversation history хадгалах (24 цагийн TTL-тай)
 */
async function setSupportConversation(sessionId: string, messages: ConversationMessage[]): Promise<void> {
  await setCache(`${SUPPORT_CONVERSATION_PREFIX}${sessionId}`, messages, SUPPORT_CONVERSATION_TTL);
}

export async function sendMessage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Declare chatbot outside try block for error handling rollback
  let chatbot: { id: string; user_id: string; name: string; website_url: string; settings: ChatbotSettings; status: string } | null = null;

  try {
    const { chatbotId, sessionId, message } = req.body as ChatMessageInput;

    // Get chatbot (allow any status in development for testing)
    const query = supabaseAdmin
      .from("chatbots")
      .select("id, user_id, name, website_url, settings, status")
      .eq("id", chatbotId);

    // In production, only allow ready chatbots
    if (process.env.NODE_ENV === "production") {
      query.eq("status", "ready");
    }

    const { data: chatbotData, error: chatbotError } = await query.single();
    chatbot = chatbotData;

    if (chatbotError || !chatbot) {
      throw new NotFoundError("Chatbot");
    }

    // ATOMIC: Check usage limit and increment in single transaction (prevents race conditions)
    await checkAndIncrementUsage(chatbot.user_id, "message");

    // Get or create conversation
    let { data: conversation } = await supabaseAdmin
      .from("conversations")
      .select("id, messages")
      .eq("chatbot_id", chatbotId)
      .eq("session_id", sessionId)
      .single();

    const history: ConversationMessage[] = conversation?.messages || [];

    // Build context from similar embeddings
    const context = await aiService.buildContext(chatbotId, message);

    // Get AI response
    const response = await aiService.getChatResponse(
      message,
      context,
      history,
      chatbot.settings,
      chatbot.name
    );

    // Update conversation — хуучин message-ийг хязгаарлаж JSONB хэтрэхээс хамгаалах
    const allMessages: ConversationMessage[] = [
      ...history,
      { role: "user", content: message, timestamp: new Date().toISOString() },
      { role: "assistant", content: response, timestamp: new Date().toISOString() },
    ];
    // Хамгийн сүүлийн N message-г л хадгална — JSONB array хязгааргүй өсөхөөс хамгаална
    const newMessages = allMessages.slice(-MAX_STORED_MESSAGES);

    if (conversation) {
      await supabaseAdmin
        .from("conversations")
        .update({
          messages: newMessages,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversation.id);
    } else {
      await supabaseAdmin.from("conversations").insert({
        chatbot_id: chatbotId,
        session_id: sessionId,
        messages: newMessages,
      });
    }

    logger.info("Chat message processed", {
      chatbotId,
      sessionId,
      contextChunks: context.sources.length,
    });

    res.json({
      message: response,
      sources: context.sources,
    });

    // Analyze sentiment asynchronously (don't block the response)
    analyzeSentiment(message).then(async (sentiment) => {
      try {
        // Update the user message with sentiment
        const updatedMessages = [...newMessages];
        // Find the user message we just added (second to last)
        const userMsgIndex = updatedMessages.length - 2;
        if (userMsgIndex >= 0 && updatedMessages[userMsgIndex].role === "user") {
          updatedMessages[userMsgIndex].sentiment = sentiment;

          // Get conversation ID
          const { data: conv } = await supabaseAdmin
            .from("conversations")
            .select("id")
            .eq("chatbot_id", chatbotId)
            .eq("session_id", sessionId)
            .single();

          if (conv) {
            await supabaseAdmin
              .from("conversations")
              .update({ messages: updatedMessages })
              .eq("id", conv.id);
          }
        }
      } catch (err) {
        logger.error("Failed to update sentiment", { error: err });
      }
    });
  } catch (error) {
    // Rollback message usage on failure before response
    // BUT NOT if the error is from checkAndIncrementUsage (limit exceeded)
    // If limit exceeded, usage was never incremented, so no rollback needed
    // Only rollback if we successfully got chatbot info (meaning increment happened)
    const isUsageLimitError = error instanceof AuthorizationError;
    if (chatbot?.user_id && !isUsageLimitError) {
      try {
        await decrementUsage(chatbot.user_id, "message");
        logger.info("Message usage rolled back due to error", {
          chatbotId: chatbot.id,
          userId: chatbot.user_id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      } catch (rollbackError) {
        logger.error("Failed to rollback message usage", {
          error: rollbackError,
          userId: chatbot.user_id,
        });
      }
    }
    next(error);
  }
}

export async function streamMessage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Declare chatbot outside try block for error handling rollback
  let chatbot: { id: string; user_id: string; name: string; website_url: string; settings: ChatbotSettings; status: string } | null = null;
  // Store user_id for rollback in case chatbot becomes null
  let userIdForRollback: string | null = null;
  // Streaming дотоод алдааны error event аль хэдийн client-руу бичигдсэн эсэхийг тэмдэглэх
  let streamErrorSent = false;

  try {
    const { chatbotId, sessionId, message } = req.body as ChatMessageInput;

    // Get chatbot (allow any status in development for testing)
    const query = supabaseAdmin
      .from("chatbots")
      .select("id, user_id, name, website_url, settings, status")
      .eq("id", chatbotId);

    // In production, only allow ready chatbots
    if (process.env.NODE_ENV === "production") {
      query.eq("status", "ready");
    }

    const { data: chatbotData, error: chatbotError } = await query.single();
    chatbot = chatbotData;

    if (chatbotError || !chatbot) {
      throw new NotFoundError("Chatbot");
    }

    // Store user_id for potential rollback
    userIdForRollback = chatbot.user_id;

    // ATOMIC: Check usage limit and increment in single transaction (prevents race conditions)
    await checkAndIncrementUsage(chatbot.user_id, "message");

    // Get conversation history
    const { data: conversation } = await supabaseAdmin
      .from("conversations")
      .select("id, messages")
      .eq("chatbot_id", chatbotId)
      .eq("session_id", sessionId)
      .single();

    const history: ConversationMessage[] = conversation?.messages || [];

    // Build context
    const context = await aiService.buildContext(chatbotId, message);

    // Set up SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    let fullResponse = "";

    // Stream response
    try {
      for await (const chunk of aiService.streamResponse(
        message,
        context,
        history,
        chatbot.settings,
        chatbot.name
      )) {
        fullResponse += chunk;
        try {
          res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
        } catch (writeError) {
          throw writeError;
        }
      }

      // Send completion event with sources
      try {
        res.write(
          `data: ${JSON.stringify({
            type: "done",
            sources: context.sources,
          })}\n\n`
        );
      } catch (writeError) {
        throw writeError;
      }
    } catch (streamError) {
      // Try to write error event, but handle write failures gracefully
      try {
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            message: "Failed to generate response",
          })}\n\n`
        );
        streamErrorSent = true;
      } catch (writeError) {
        logger.error("Failed to write error event during streaming", {
          error: writeError,
          originalError: streamError,
          chatbotId
        });
      }
      logger.error("Stream error", { error: streamError, chatbotId });
      throw streamError;
    }

    res.end();

    // Save conversation (after streaming completes) — message тоог хязгаарлана
    const allMessages: ConversationMessage[] = [
      ...history,
      { role: "user", content: message, timestamp: new Date().toISOString() },
      { role: "assistant", content: fullResponse, timestamp: new Date().toISOString() },
    ];
    const newMessages = allMessages.slice(-MAX_STORED_MESSAGES);

    if (conversation) {
      await supabaseAdmin
        .from("conversations")
        .update({
          messages: newMessages,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversation.id);
    } else {
      await supabaseAdmin.from("conversations").insert({
        chatbot_id: chatbotId,
        session_id: sessionId,
        messages: newMessages,
      });
    }

    logger.info("Streaming chat completed", {
      chatbotId,
      sessionId,
      responseLength: fullResponse.length,
    });

    // Analyze sentiment asynchronously (don't block the response)
    analyzeSentiment(message).then(async (sentiment) => {
      try {
        // Update the user message with sentiment
        const updatedMessages = [...newMessages];
        // Find the user message we just added (second to last)
        const userMsgIndex = updatedMessages.length - 2;
        if (userMsgIndex >= 0 && updatedMessages[userMsgIndex].role === "user") {
          updatedMessages[userMsgIndex].sentiment = sentiment;

          // Get conversation ID
          const { data: conv } = await supabaseAdmin
            .from("conversations")
            .select("id")
            .eq("chatbot_id", chatbotId)
            .eq("session_id", sessionId)
            .single();

          if (conv) {
            await supabaseAdmin
              .from("conversations")
              .update({ messages: updatedMessages })
              .eq("id", conv.id);
          }
        }
      } catch (err) {
        logger.error("Failed to update sentiment", { error: err });
      }
    });
  } catch (error) {
    // Rollback usage ONLY if:
    // 1. Streaming hasn't started (headers not sent)
    // 2. The error is NOT an AuthorizationError from checkAndIncrementUsage (limit exceeded)
    //    - If limit exceeded, usage was never incremented, so no rollback needed
    // If headers sent = streaming started = service delivered = no rollback
    // This follows industry standard (OpenAI, AWS) and prevents abuse
    const isUsageLimitError = error instanceof AuthorizationError;
    if (!res.headersSent && userIdForRollback && !isUsageLimitError) {
      try {
        await decrementUsage(userIdForRollback, "message");
        logger.info("Message usage rolled back - streaming not started", {
          chatbotId: chatbot?.id,
          userId: userIdForRollback,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      } catch (rollbackError) {
        logger.error("Failed to rollback message usage", {
          error: rollbackError,
          userId: userIdForRollback,
        });
      }
    }

    // SSE headers аль хэдийн илгээгдсэн бол error event бичээд дуусгах
    // streamErrorSent=true бол дотоод catch аль хэдийн error event бичсэн — давхардуулахгүй
    if (res.headersSent) {
      try {
        if (!streamErrorSent) {
          res.write(
            `data: ${JSON.stringify({
              type: "error",
              message: error instanceof Error ? error.message : "Unknown error",
            })}\n\n`
          );
        }
        res.end();
      } catch (writeError) {
        try {
          res.end();
        } catch {
          // Ignore errors when ending
        }
        logger.error("Failed to write error event", { error: writeError });
      }
    } else {
      next(error);
    }
  }
}

export async function getConversation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { chatbotId, sessionId } = req.params;

    if (!chatbotId || !sessionId) {
      throw new ValidationError("Chatbot ID and Session ID are required");
    }

    const { data: conversation, error } = await supabaseAdmin
      .from("conversations")
      .select("id, messages, created_at, updated_at")
      .eq("chatbot_id", chatbotId)
      .eq("session_id", sessionId)
      .single();

    if (error || !conversation) {
      // Return empty conversation if not found
      res.json({
        messages: [],
        created_at: null,
      });
      return;
    }

    res.json(conversation);
  } catch (error) {
    next(error);
  }
}

/**
 * Built-in support bot for ConvoAI landing page
 * Uses streaming responses with pre-configured knowledge about ConvoAI
 */
export async function supportBotMessage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { sessionId, message } = req.body;

    if (!message || typeof message !== "string") {
      res.status(400).json({ message: "Message is required" });
      return;
    }

    const sid = sessionId || "anonymous";

    logger.info("Support bot request started", {
      sessionId: sid,
      messageLength: message.length,
    });

    // Redis-с conversation history авах
    const history = await getSupportConversation(sid);

    // Set up SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    let fullResponse = "";

    try {
      const messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: SUPPORT_BOT_SYSTEM_PROMPT },
        // Keep last 6 messages only to leave room for response
        ...history.slice(-6).map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
        { role: "user", content: message },
      ];

      const model = "gpt-5-mini";
      const maxTokens = 1500; // Increased from 500 to allow longer responses
      
      const requestParams: Record<string, unknown> = {
        model,
        messages,
        stream: true,
      };

      // GPT-5 series models don't support temperature parameter (only default value 1)
      // Only add temperature for non-GPT-5 models
      if (!requiresMaxCompletionTokens(model)) {
        requestParams.temperature = 0.7;
      }

      // Use max_completion_tokens for GPT-5 series models
      if (requiresMaxCompletionTokens(model)) {
        requestParams.max_completion_tokens = maxTokens;
      } else {
        requestParams.max_tokens = maxTokens;
      }

      const stream = await openai.chat.completions.create(
        requestParams as unknown as OpenAI.ChatCompletionCreateParamsStreaming
      );

      logger.info("Support bot: OpenAI stream started", { sessionId: sid });

      let chunkCount = 0;
      let totalChunks = 0;
      for await (const chunk of stream) {
        totalChunks++;
        const content = chunk.choices[0]?.delta?.content;

        // Log first few chunks for debugging
        if (totalChunks <= 3) {
          logger.info("Support bot: Chunk received", {
            sessionId: sid,
            chunkNumber: totalChunks,
            hasContent: !!content,
            contentLength: content?.length || 0,
            finishReason: chunk.choices[0]?.finish_reason,
          });
        }

        if (content) {
          chunkCount++;
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ type: "chunk", content })}\n\n`);
        }
      }

      logger.info("Support bot: Stream completed", {
        sessionId: sid,
        responseLength: fullResponse.length,
        chunkCount,
        totalChunks,
        historyLength: history.length,
      });

      // Check if we got any response
      if (fullResponse.length === 0) {
        logger.warn("Support bot: Empty response from OpenAI", { sessionId: sid });
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            message: "Received empty response from AI. Please try again.",
          })}\n\n`
        );
      } else {
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      }
    } catch (streamError) {
      logger.error("Support bot stream error", {
        error: streamError,
        errorMessage: streamError instanceof Error ? streamError.message : "Unknown error",
        errorStack: streamError instanceof Error ? streamError.stack : undefined,
        sessionId: sid,
      });
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: "Failed to generate response",
        })}\n\n`
      );
    }

    res.end();

    // Redis-д conversation history хадгалах (сүүлийн 20 мессеж, 24 цагийн TTL)
    // TTL нь автоматаар хуучин conversation-г цэвэрлэнэ — in-memory Map шиг memory leak үүсгэхгүй
    const updatedHistory: ConversationMessage[] = [
      ...history,
      { role: "user" as const, content: message, timestamp: new Date().toISOString() },
      { role: "assistant" as const, content: fullResponse, timestamp: new Date().toISOString() },
    ].slice(-20);

    await setSupportConversation(sid, updatedHistory);

  } catch (error) {
    if (res.headersSent) {
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        })}\n\n`
      );
      res.end();
    } else {
      next(error);
    }
  }
}
