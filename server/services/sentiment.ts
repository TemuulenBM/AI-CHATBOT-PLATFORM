import OpenAI from "openai";
import logger from "../utils/logger";
import { requiresMaxCompletionTokens } from "./ai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export type Sentiment = "positive" | "neutral" | "negative";

const SENTIMENT_PROMPT = `## INPUT
User message below.

## TASK
Classify sentiment as: positive, neutral, or negative.

## CONSTRAINTS
- Respond with ONLY one word
- positive = happy, satisfied, grateful, excited, complimentary
- neutral = questions, factual statements, informational
- negative = frustrated, angry, disappointed, complaints, issues

## OUTPUT FORMAT
Single word: positive, neutral, or negative

Message: `;

/**
 * Analyze the sentiment of a user message using GPT-5-nano
 * This runs asynchronously to avoid impacting response latency
 */
export async function analyzeSentiment(text: string): Promise<Sentiment> {
    try {
        // Skip very short messages
        if (text.length < 5) {
            return "neutral";
        }

        const model = "gpt-5-nano";
        const maxTokens = 10;
        
        const requestParams: Record<string, unknown> = {
            model,
            messages: [
                {
                    role: "user",
                    content: SENTIMENT_PROMPT + text,
                },
            ],
        };

        // GPT-5 серийн моделиуд temperature параметр дэмжихгүй (default: 1)
        if (!requiresMaxCompletionTokens(model)) {
            requestParams.temperature = 0;
        }

        // Use max_completion_tokens for GPT-5 series models
        if (requiresMaxCompletionTokens(model)) {
            requestParams.max_completion_tokens = maxTokens;
        } else {
            requestParams.max_tokens = maxTokens;
        }

        const response = await openai.chat.completions.create(
            requestParams as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming
        );

        const result =
            response.choices[0]?.message?.content?.toLowerCase().trim() || "neutral";

        // Validate the response
        if (result === "positive" || result === "negative" || result === "neutral") {
            return result;
        }

        // Default to neutral if we get an unexpected response
        return "neutral";
    } catch (error) {
        logger.error("Sentiment analysis failed", { error, textLength: text.length });
        // Return neutral on error to avoid blocking the flow
        return "neutral";
    }
}

/**
 * Analyze sentiment for multiple messages in batch
 * More efficient for processing conversation history
 */
export async function analyzeSentimentBatch(
    messages: string[]
): Promise<Sentiment[]> {
    const results = await Promise.all(
        messages.map((msg) => analyzeSentiment(msg))
    );
    return results;
}

export default { analyzeSentiment, analyzeSentimentBatch };
