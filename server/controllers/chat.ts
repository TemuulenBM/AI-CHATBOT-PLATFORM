import { Request, Response, NextFunction } from "express";
import { supabaseAdmin, ConversationMessage } from "../utils/supabase";
import { AuthenticatedRequest, checkUsageLimit, incrementUsage } from "../middleware/auth";
import { NotFoundError, ValidationError } from "../utils/errors";
import { ChatMessageInput } from "../middleware/validation";
import { aiService } from "../services/ai";
import logger from "../utils/logger";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// System prompt for built-in ConvoAI support bot
const SUPPORT_BOT_SYSTEM_PROMPT = `You are the official support assistant for ConvoAI - an AI chatbot platform that helps businesses create custom AI chatbots trained on their website content.

## About ConvoAI:
- ConvoAI lets users create AI chatbots that are trained on their website content
- Users can scrape their website URLs, and the system automatically extracts content and creates embeddings
- The chatbots can be embedded on any website using a simple JavaScript widget
- Built with modern tech: React, Node.js, OpenAI GPT-4, PostgreSQL with vector search

## Key Features:
- **Easy Setup**: Just enter your website URL and we automatically scrape and train
- **Custom Training**: Chatbots learn from your specific website content
- **Embeddable Widget**: Add to any website with a single script tag
- **Real-time Chat**: Streaming responses for natural conversations
- **Analytics Dashboard**: Track conversations and usage
- **Multiple Plans**: Free trial, Starter ($29/mo), Growth ($79/mo), Business ($199/mo)

## Pricing Plans:
- **Free Trial**: 14 days, 1 chatbot, 100 messages
- **Starter ($29/mo)**: 3 chatbots, 1,000 messages/month
- **Growth ($79/mo)**: 10 chatbots, 5,000 messages/month  
- **Business ($199/mo)**: Unlimited chatbots, 20,000 messages/month

## Guidelines:
- Be friendly, helpful, and concise
- Answer questions about ConvoAI's features, pricing, and how it works
- Encourage users to start their free trial
- If asked about technical implementation details you don't know, suggest they contact support
- Keep responses conversational but informative`;

// In-memory conversation history for support bot (simple implementation)
const supportConversations = new Map<string, ConversationMessage[]>();

export async function sendMessage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
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

    const { data: chatbot, error: chatbotError } = await query.single();

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

    // Get chatbot (allow any status in development for testing)
    const query = supabaseAdmin
      .from("chatbots")
      .select("id, user_id, name, website_url, settings, status")
      .eq("id", chatbotId);

    // In production, only allow ready chatbots
    if (process.env.NODE_ENV === "production") {
      query.eq("status", "ready");
    }

    const { data: chatbot, error: chatbotError } = await query.single();

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
    
    // Get conversation history
    const history = supportConversations.get(sid) || [];

    // Set up SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    let fullResponse = "";

    try {
      const messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: SUPPORT_BOT_SYSTEM_PROMPT },
        ...history.slice(-10).map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
        { role: "user", content: message },
      ];

      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.7,
        max_tokens: 500,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ type: "chunk", content })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    } catch (streamError) {
      logger.error("Support bot stream error", { error: streamError });
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: "Failed to generate response",
        })}\n\n`
      );
    }

    res.end();

    // Save to conversation history (keep last 20 messages)
    const updatedHistory: ConversationMessage[] = [
      ...history,
      { role: "user" as const, content: message, timestamp: new Date().toISOString() },
      { role: "assistant" as const, content: fullResponse, timestamp: new Date().toISOString() },
    ].slice(-20);

    supportConversations.set(sid, updatedHistory);

    // Clean up old conversations periodically (simple cleanup)
    if (supportConversations.size > 1000) {
      const keys = Array.from(supportConversations.keys());
      keys.slice(0, 500).forEach((k) => supportConversations.delete(k));
    }

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
