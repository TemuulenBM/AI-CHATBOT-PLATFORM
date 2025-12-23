import { Response, NextFunction } from "express";
import { supabaseAdmin, ConversationMessage } from "../utils/supabase";
import { AuthenticatedRequest, checkUsageLimit, incrementUsage } from "../middleware/auth";
import { NotFoundError, ValidationError } from "../utils/errors";
import { ChatMessageInput } from "../middleware/validation";
import { aiService } from "../services/ai";
import logger from "../utils/logger";

export async function sendMessage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { chatbotId, sessionId, message } = req.body as ChatMessageInput;

    // Get chatbot
    const { data: chatbot, error: chatbotError } = await supabaseAdmin
      .from("chatbots")
      .select("id, user_id, name, website_url, settings, status")
      .eq("id", chatbotId)
      .eq("status", "ready")
      .single();

    if (chatbotError || !chatbot) {
      throw new NotFoundError("Chatbot");
    }

    // Check usage limit for chatbot owner
    await checkUsageLimit(chatbot.user_id, "message");

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

    // Update conversation
    const newMessages: ConversationMessage[] = [
      ...history,
      { role: "user", content: message, timestamp: new Date().toISOString() },
      { role: "assistant", content: response, timestamp: new Date().toISOString() },
    ];

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

    // Increment usage
    await incrementUsage(chatbot.user_id, "message");

    logger.info("Chat message processed", {
      chatbotId,
      sessionId,
      contextChunks: context.sources.length,
    });

    res.json({
      message: response,
      sources: context.sources,
    });
  } catch (error) {
    next(error);
  }
}

export async function streamMessage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { chatbotId, sessionId, message } = req.body as ChatMessageInput;

    // Get chatbot
    const { data: chatbot, error: chatbotError } = await supabaseAdmin
      .from("chatbots")
      .select("id, user_id, name, website_url, settings, status")
      .eq("id", chatbotId)
      .eq("status", "ready")
      .single();

    if (chatbotError || !chatbot) {
      throw new NotFoundError("Chatbot");
    }

    // Check usage limit for chatbot owner
    await checkUsageLimit(chatbot.user_id, "message");

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
        res.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
      }

      // Send completion event with sources
      res.write(
        `data: ${JSON.stringify({
          type: "done",
          sources: context.sources,
        })}\n\n`
      );
    } catch (streamError) {
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: "Failed to generate response",
        })}\n\n`
      );
      logger.error("Stream error", { error: streamError, chatbotId });
    }

    res.end();

    // Save conversation (after streaming completes)
    const newMessages: ConversationMessage[] = [
      ...history,
      { role: "user", content: message, timestamp: new Date().toISOString() },
      { role: "assistant", content: fullResponse, timestamp: new Date().toISOString() },
    ];

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

    // Increment usage
    await incrementUsage(chatbot.user_id, "message");

    logger.info("Streaming chat completed", {
      chatbotId,
      sessionId,
      responseLength: fullResponse.length,
    });
  } catch (error) {
    // For SSE, we need to handle errors differently if headers are already sent
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
