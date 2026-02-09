import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { ChatbotSettings, ConversationMessage } from "../utils/supabase";
import { embeddingService } from "./embedding";
import { knowledgeBaseService } from "./knowledge-base";
import logger from "../utils/logger";
import { ExternalServiceError } from "../utils/errors";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

type AIProvider = "openai" | "anthropic";

interface ChatContext {
  relevantContent: string;
  sources: string[];
  isManualKnowledge?: boolean; // Flag to indicate if content is from manual Q&A
}

interface ChatOptions {
  provider?: AIProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

const DEFAULT_OPTIONS: ChatOptions = {
  provider: "openai",
  model: "gpt-5-mini",
  temperature: 0.7,
  maxTokens: 1000,
};

// Input/Context limits for cost optimization and reliability
const MAX_CONTEXT_CHUNKS = 3;       // Reduced from 5 to 3 chunks
const MAX_HISTORY_MESSAGES = 20;    // Keep last 20 messages only
const MAX_CONTEXT_LENGTH = 4000;    // Max characters for context (~1000 tokens)
const MAX_TOTAL_INPUT_TOKENS = 10000; // Soft limit for total input (conservative estimate)

// Streaming timeout тохиргоо
// Per-chunk: chunk хооронд 10 секундээс удаан хүлээвэл timeout — network hang эсвэл API саатлыг илрүүлнэ
// Total: нэг response-д 60 секундээс илүү хугацаа зарцуулахгүй — server ресурс хамгаалах
const STREAM_CHUNK_TIMEOUT_MS = 10_000;  // 10 секунд chunk бүрийн хоорондох хамгийн их хугацаа
const STREAM_TOTAL_TIMEOUT_MS = 60_000;  // 60 секунд нийт хамгийн их хугацаа

/**
 * Check if a model requires max_completion_tokens instead of max_tokens
 * GPT-5 series and o1 models use max_completion_tokens
 */
export function requiresMaxCompletionTokens(model: string): boolean {
  return model.startsWith("gpt-5") || model.includes("o1");
}

export class AIService {
  /**
   * Build context from knowledge base and embeddings
   * Priority:
   * 1. Manual Q&A knowledge base (highest priority - exact semantic match)
   * 2. Scraped embeddings (fallback if no manual match)
   * 3. Empty context (if nothing matches - training mode)
   */
  async buildContext(
    chatbotId: string,
    message: string
  ): Promise<ChatContext> {
    try {
      // Step 1: Check manual knowledge base first
      const kbMatches = await knowledgeBaseService.searchKnowledgeBase(
        chatbotId,
        message,
        3,
        0.8 // Higher threshold for manual Q&A
      );

      if (kbMatches.length > 0 && kbMatches[0].similarity > 0.8) {
        // Use manual knowledge base answer directly
        const topMatch = kbMatches[0];
        logger.info("Using manual knowledge base answer", {
          chatbotId,
          entryId: topMatch.id,
          similarity: topMatch.similarity,
        });

        return {
          relevantContent: topMatch.answer,
          sources: [`Knowledge Base: ${topMatch.question}`],
          isManualKnowledge: true,
        };
      }

      // Step 2: Fall back to scraped content embeddings
      // Use MAX_CONTEXT_CHUNKS instead of hardcoded 5
      const similar = await embeddingService.findSimilar(
        chatbotId,
        message,
        MAX_CONTEXT_CHUNKS, // 3 chunks instead of 5
        0.6
      );

      if (similar.length === 0) {
        return { relevantContent: "", sources: [] };
      }

      // Build context from chunks
      let relevantContent = similar
        .map((s, i) => `[${i + 1}] ${s.content}`)
        .join("\n\n");

      // Apply character limit to prevent token overflow
      if (relevantContent.length > MAX_CONTEXT_LENGTH) {
        relevantContent = relevantContent.substring(0, MAX_CONTEXT_LENGTH) + "\n[...truncated for length]";
        logger.debug("Context truncated due to length limit", {
          chatbotId,
          originalLength: relevantContent.length,
          truncatedTo: MAX_CONTEXT_LENGTH,
        });
      }

      const sources = Array.from(new Set(similar.map((s) => s.pageUrl)));

      return { relevantContent, sources, isManualKnowledge: false };
    } catch (error) {
      // If embeddings don't exist yet, return empty context (training mode)
      logger.warn("Failed to build context, using fallback mode", { chatbotId, error });
      return { relevantContent: "", sources: [] };
    }
  }

  /**
   * Check if error is related to context length/token limit
   */
  private isContextLengthError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message?.toLowerCase() || "";
    const errorCode = error.code?.toLowerCase() || "";

    // OpenAI context length errors
    if (
      errorMessage.includes("context_length_exceeded") ||
      errorMessage.includes("maximum context length") ||
      errorMessage.includes("token limit") ||
      errorCode === "context_length_exceeded"
    ) {
      return true;
    }

    // Anthropic context length errors
    if (
      errorMessage.includes("prompt is too long") ||
      errorMessage.includes("maximum context") ||
      errorCode === "invalid_request_error"
    ) {
      return true;
    }

    return false;
  }

  /**
   * Limit conversation history to prevent context window overflow
   * Keeps the most recent messages up to MAX_HISTORY_MESSAGES
   */
  private limitHistory(history: ConversationMessage[]): ConversationMessage[] {
    if (history.length <= MAX_HISTORY_MESSAGES) {
      return history;
    }

    const limitedHistory = history.slice(-MAX_HISTORY_MESSAGES);

    logger.debug("Conversation history truncated", {
      originalCount: history.length,
      truncatedTo: MAX_HISTORY_MESSAGES,
      removedCount: history.length - MAX_HISTORY_MESSAGES,
    });

    return limitedHistory;
  }

  /**
   * Build system prompt for chatbot using KERNEL framework
   * Handles both training mode (no context) and trained mode (with context)
   */
  buildSystemPrompt(
    websiteName: string,
    settings: ChatbotSettings,
    relevantContent: string
  ): string {
    const personalityDesc =
      settings.personality < 30
        ? "professional and formal"
        : settings.personality > 70
          ? "friendly and casual"
          : "balanced and helpful";

    // KERNEL: Keep it simple - single clear role
    let prompt = settings.systemPrompt ||
      `You are a ${personalityDesc} AI assistant for ${websiteName}.`;

    if (relevantContent) {
      // Trained mode - KERNEL applied
      prompt += `\n\n## INPUT
${relevantContent}

## TASK
Answer user questions using the knowledge base above.

## CONSTRAINTS
- Use only information from the knowledge base
- If information is not in the knowledge base, you MUST respond: "I don't have that information. I can help with questions about ${websiteName}."
- Keep responses under 200 words
- Cite sources when using specific facts
- Maintain conversation context

## OUTPUT FORMAT
Direct, conversational answers with source citations when relevant.`;
    } else {
      // Training mode - KERNEL applied
      prompt += `\n\n## TASK
Assist users with general questions about ${websiteName}.

## CONSTRAINTS
- Provide general helpful responses only
- Do not fabricate specific details about ${websiteName}
- Keep responses under 150 words
- Be honest if you lack specific ${websiteName} information
- If you don't know something about ${websiteName}, you MUST respond: "I don't know. I'm still learning about ${websiteName}. Can you help me understand?"

## OUTPUT FORMAT
Helpful, concise responses acknowledging knowledge limitations when appropriate.`;
    }

    return prompt;
  }

  /**
   * Get AI response (non-streaming)
   */
  async getChatResponse(
    message: string,
    context: ChatContext,
    history: ConversationMessage[],
    settings: ChatbotSettings,
    websiteName: string,
    options: ChatOptions = {}
  ): Promise<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Limit history to prevent context overflow
    const limitedHistory = this.limitHistory(history);

    const systemPrompt = this.buildSystemPrompt(
      websiteName,
      settings,
      context.relevantContent
    );

    try {
      if (opts.provider === "anthropic") {
        return await this.getAnthropicResponse(
          message,
          limitedHistory,
          systemPrompt,
          opts
        );
      }

      return await this.getOpenAIResponse(
        message,
        limitedHistory,
        systemPrompt,
        opts
      );
    } catch (error) {
      // Add specific handling for context length errors
      if (this.isContextLengthError(error)) {
        logger.error("Context length exceeded, retrying with reduced context", {
          provider: opts.provider,
          error,
        });

        // Fallback: try again with empty context
        const fallbackPrompt = this.buildSystemPrompt(websiteName, settings, "");

        try {
          if (opts.provider === "anthropic") {
            return await this.getAnthropicResponse(message, [], fallbackPrompt, opts);
          }
          return await this.getOpenAIResponse(message, [], fallbackPrompt, opts);
        } catch (fallbackError) {
          logger.error("Fallback also failed", { error: fallbackError });
          throw new ExternalServiceError(
            opts.provider || "AI",
            "Failed to generate response even with reduced context"
          );
        }
      }

      logger.error("AI response error", { error, provider: opts.provider });
      throw new ExternalServiceError(
        opts.provider || "AI",
        "Failed to generate response"
      );
    }
  }

  private async getOpenAIResponse(
    message: string,
    history: ConversationMessage[],
    systemPrompt: string,
    options: ChatOptions
  ): Promise<string> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-10).map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user", content: message },
    ];

    const model = options.model || "gpt-5-mini";
    const requestParams: Record<string, unknown> = {
      model,
      messages,
    };

    // GPT-5 series models don't support temperature parameter (only default value 1)
    // Only add temperature for non-GPT-5 models
    if (!requiresMaxCompletionTokens(model)) {
      requestParams.temperature = options.temperature;
    }

    // Use max_completion_tokens for GPT-5 series and o1 models
    if (requiresMaxCompletionTokens(model)) {
      requestParams.max_completion_tokens = options.maxTokens;
    } else {
      requestParams.max_tokens = options.maxTokens;
    }

    const response = await openai.chat.completions.create(requestParams as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming);

    // choices undefined эсвэл хоосон array бол TypeError үүсэхээс хамгаалах
    return response.choices?.[0]?.message?.content || "I apologize, I couldn't generate a response.";
  }

  private async getAnthropicResponse(
    message: string,
    history: ConversationMessage[],
    systemPrompt: string,
    options: ChatOptions
  ): Promise<string> {
    const messages: Anthropic.MessageParam[] = history.slice(-10).map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    messages.push({ role: "user", content: message });

    const response = await anthropic.messages.create({
      model: options.model || "claude-4-5-opus-20251124",
      max_tokens: options.maxTokens || 1000,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((block) => block.type === "text");
    return textBlock?.type === "text" ? textBlock.text : "I apologize, I couldn't generate a response.";
  }

  /**
   * Stream AI response using Server-Sent Events
   */
  async *streamResponse(
    message: string,
    context: ChatContext,
    history: ConversationMessage[],
    settings: ChatbotSettings,
    websiteName: string,
    options: ChatOptions = {}
  ): AsyncGenerator<string> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Limit history to prevent context overflow
    const limitedHistory = this.limitHistory(history);

    const systemPrompt = this.buildSystemPrompt(
      websiteName,
      settings,
      context.relevantContent
    );

    try {
      if (opts.provider === "anthropic") {
        yield* this.streamAnthropicResponse(message, limitedHistory, systemPrompt, opts);
      } else {
        yield* this.streamOpenAIResponse(message, limitedHistory, systemPrompt, opts);
      }
    } catch (error) {
      logger.error("AI streaming error", { error, provider: opts.provider });
      throw new ExternalServiceError(
        opts.provider || "AI",
        "Failed to stream response"
      );
    }
  }

  private async *streamOpenAIResponse(
    message: string,
    history: ConversationMessage[],
    systemPrompt: string,
    options: ChatOptions
  ): AsyncGenerator<string> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-10).map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user", content: message },
    ];

    const model = options.model || "gpt-5-mini";
    const requestParams: Record<string, unknown> = {
      model,
      messages,
      stream: true,
    };

    // GPT-5 series models don't support temperature parameter (only default value 1)
    // Only add temperature for non-GPT-5 models
    if (!requiresMaxCompletionTokens(model)) {
      requestParams.temperature = options.temperature;
    }

    // Use max_completion_tokens for GPT-5 series and o1 models
    if (requiresMaxCompletionTokens(model)) {
      requestParams.max_completion_tokens = options.maxTokens;
    } else {
      requestParams.max_tokens = options.maxTokens;
    }

    const stream = await openai.chat.completions.create(requestParams as unknown as OpenAI.ChatCompletionCreateParamsStreaming);

    // Timeout хамгаалалт: chunk хооронд 10s, нийт 60s
    const streamStart = Date.now();

    for await (const chunk of stream) {
      // Нийт хугацааны шалгалт — нэг response 60 секундээс хэтрэхгүй
      if (Date.now() - streamStart > STREAM_TOTAL_TIMEOUT_MS) {
        logger.warn("Stream total timeout хэтэрсэн, зогсоож байна", { model });
        break;
      }

      // choices undefined эсвэл хоосон array бол TypeError үүсэхээс хамгаалах
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }

  private async *streamAnthropicResponse(
    message: string,
    history: ConversationMessage[],
    systemPrompt: string,
    options: ChatOptions
  ): AsyncGenerator<string> {
    const messages: Anthropic.MessageParam[] = history.slice(-10).map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    messages.push({ role: "user", content: message });

    const stream = anthropic.messages.stream({
      model: options.model || "claude-4-5-opus-20251124",
      max_tokens: options.maxTokens || 1000,
      system: systemPrompt,
      messages,
    });

    // Timeout хамгаалалт: нийт 60s
    const streamStart = Date.now();

    for await (const event of stream) {
      // Нийт хугацааны шалгалт
      if (Date.now() - streamStart > STREAM_TOTAL_TIMEOUT_MS) {
        logger.warn("Anthropic stream total timeout хэтэрсэн, зогсоож байна");
        break;
      }

      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  }
}

export const aiService = new AIService();
