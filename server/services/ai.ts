import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { ChatbotSettings, ConversationMessage } from "../utils/supabase";
import { embeddingService } from "./embedding";
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

/**
 * Check if a model requires max_completion_tokens instead of max_tokens
 * GPT-5 series and o1 models use max_completion_tokens
 */
export function requiresMaxCompletionTokens(model: string): boolean {
  return model.startsWith("gpt-5") || model.includes("o1");
}

export class AIService {
  /**
   * Build context from similar embeddings
   * Returns empty context if chatbot is still training (no embeddings yet)
   */
  async buildContext(
    chatbotId: string,
    message: string
  ): Promise<ChatContext> {
    try {
      const similar = await embeddingService.findSimilar(chatbotId, message, 5, 0.6);

      if (similar.length === 0) {
        return { relevantContent: "", sources: [] };
      }

      const relevantContent = similar
        .map((s, i) => `[${i + 1}] ${s.content}`)
        .join("\n\n");

      const sources = Array.from(new Set(similar.map((s) => s.pageUrl)));

      return { relevantContent, sources };
    } catch (error) {
      // If embeddings don't exist yet, return empty context (training mode)
      logger.warn("Failed to build context, using fallback mode", { chatbotId, error });
      return { relevantContent: "", sources: [] };
    }
  }

  /**
   * Build system prompt for chatbot
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

    let prompt = settings.systemPrompt || `You are a helpful AI assistant for ${websiteName}.`;

    prompt += `\n\nPersonality: Be ${personalityDesc}.`;

    if (relevantContent) {
      // Trained mode - has website context
      prompt += `\n\n## Relevant Context from the website:\n${relevantContent}`;
      prompt += `\n\n## Guidelines:
- Answer questions based on the context provided above when available
- Be helpful, accurate, and concise
- If you don't have enough information to answer accurately, say "I don't have specific information about that, but I'd be happy to help with other questions about ${websiteName}."
- Don't make up information that isn't in the context
- Keep responses conversational but informative`;
    } else {
      // Training mode - no context yet (chatbot is being trained)
      prompt += `\n\n## Training Mode - Important Instructions:
- I'm currently learning about ${websiteName}'s website content
- Training is happening in the background and will be complete shortly
- For now, provide helpful, general responses and let users know you're still being trained
- Be polite and offer to help with general questions
- Suggest users check back in a few minutes for more specific, detailed answers about ${websiteName}
- Keep a friendly, apologetic tone about the training process`;
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
    const systemPrompt = this.buildSystemPrompt(
      websiteName,
      settings,
      context.relevantContent
    );

    try {
      if (opts.provider === "anthropic") {
        return this.getAnthropicResponse(
          message,
          history,
          systemPrompt,
          opts
        );
      }

      return this.getOpenAIResponse(
        message,
        history,
        systemPrompt,
        opts
      );
    } catch (error) {
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

    return response.choices[0]?.message?.content || "I apologize, I couldn't generate a response.";
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
    const systemPrompt = this.buildSystemPrompt(
      websiteName,
      settings,
      context.relevantContent
    );

    try {
      if (opts.provider === "anthropic") {
        yield* this.streamAnthropicResponse(message, history, systemPrompt, opts);
      } else {
        yield* this.streamOpenAIResponse(message, history, systemPrompt, opts);
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

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
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

    for await (const event of stream) {
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
