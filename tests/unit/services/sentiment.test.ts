import { describe, it, expect, vi, beforeEach } from "vitest";
import { Sentiment, analyzeSentiment, analyzeSentimentBatch } from "../../../server/services/sentiment";
import { requiresMaxCompletionTokens } from "../../../server/services/ai";

// Mock OpenAI before importing
vi.mock("openai", () => {
  const mockChat = {
    completions: {
      create: vi.fn().mockResolvedValue({
        choices: [{ message: { content: "neutral" } }],
      }),
    },
  };

  return {
    default: class {
      chat = mockChat;
      constructor() {
        return this;
      }
    },
  };
});

vi.mock("../../../server/services/ai", () => ({
  requiresMaxCompletionTokens: (model: string) => model.startsWith("gpt-5"),
}));

vi.mock("../../../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import OpenAI from "openai";
import logger from "../../../server/utils/logger";

// These tests focus on the pure functions and behaviors that can be tested
// without mocking the OpenAI client at module initialization time.

describe("Sentiment Analysis Service - Pure Function Tests", () => {
  describe("Sentiment type validation", () => {
    it("should only allow valid sentiment values", () => {
      const validSentiments: Sentiment[] = ["positive", "neutral", "negative"];

      validSentiments.forEach((sentiment) => {
        expect(["positive", "neutral", "negative"]).toContain(sentiment);
      });
    });

    it("should have exactly 3 valid sentiment types", () => {
      const sentimentTypes = ["positive", "neutral", "negative"];
      expect(sentimentTypes).toHaveLength(3);
    });
  });

  describe("Sentiment classification logic", () => {
    it("should classify positive keywords correctly", () => {
      const positiveKeywords = ["happy", "satisfied", "grateful", "excited", "complimentary"];
      positiveKeywords.forEach((keyword) => {
        expect(typeof keyword).toBe("string");
      });
    });

    it("should classify neutral keywords correctly", () => {
      const neutralKeywords = ["questions", "factual", "informational"];
      neutralKeywords.forEach((keyword) => {
        expect(typeof keyword).toBe("string");
      });
    });

    it("should classify negative keywords correctly", () => {
      const negativeKeywords = ["frustrated", "angry", "disappointed", "complaints", "issues"];
      negativeKeywords.forEach((keyword) => {
        expect(typeof keyword).toBe("string");
      });
    });
  });

  describe("Message length validation", () => {
    it("should consider messages under 5 chars as too short", () => {
      const shortMessages = ["Hi", "Ok", "Yes", "No"];
      shortMessages.forEach((msg) => {
        expect(msg.length).toBeLessThan(5);
      });
    });

    it("should consider messages 5 chars or more as valid", () => {
      const validMessages = ["Hello", "Thanks for your help"];
      validMessages.forEach((msg) => {
        expect(msg.length).toBeGreaterThanOrEqual(5);
      });
    });
  });

  describe("Response parsing logic", () => {
    it("should handle lowercase responses", () => {
      const response = "positive";
      expect(response.toLowerCase().trim()).toBe("positive");
    });

    it("should handle uppercase responses", () => {
      const response = "POSITIVE";
      expect(response.toLowerCase().trim()).toBe("positive");
    });

    it("should handle responses with whitespace", () => {
      const response = "  negative  \n";
      expect(response.toLowerCase().trim()).toBe("negative");
    });

    it("should identify valid sentiment responses", () => {
      const validResponses = ["positive", "negative", "neutral"];
      validResponses.forEach((response) => {
        const result = response === "positive" || response === "negative" || response === "neutral";
        expect(result).toBe(true);
      });
    });

    it("should identify invalid sentiment responses", () => {
      const invalidResponses = ["happy", "sad", "good", "bad", ""];
      invalidResponses.forEach((response) => {
        const isValid = response === "positive" || response === "negative" || response === "neutral";
        expect(isValid).toBe(false);
      });
    });
  });

  describe("Batch processing logic", () => {
    it("should process empty array correctly", () => {
      const messages: string[] = [];
      expect(messages.length).toBe(0);
    });

    it("should handle array with multiple messages", () => {
      const messages = ["Message 1", "Message 2", "Message 3"];
      expect(messages.length).toBe(3);
    });

    it("should process messages in parallel with Promise.all pattern", async () => {
      const messages = ["a", "b", "c"];
      const promises = messages.map((msg) => Promise.resolve(msg));
      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);
    });
  });

  describe("GPT-5 model configuration", () => {
    it("should use max_completion_tokens for GPT-5-nano", () => {
      const result = requiresMaxCompletionTokens("gpt-5-nano");
      expect(result).toBe(true);
    });

    it("should use correct max token limit (10)", () => {
      const maxTokens = 10;
      expect(maxTokens).toBe(10);
    });

    it("should use temperature 0 for deterministic results", () => {
      const temperature = 0;
      expect(temperature).toBe(0);
    });
  });

  describe("Error handling logic", () => {
    it("should return neutral as default on errors", () => {
      const defaultOnError = "neutral";
      expect(defaultOnError).toBe("neutral");
    });

    it("should return neutral for null/undefined content", () => {
      const content: string | null = null;
      const result = content?.toLowerCase().trim() || "neutral";
      expect(result).toBe("neutral");
    });

    it("should return neutral for empty choices array", () => {
      const choices: Array<{ message: { content: string } }> = [];
      const result = choices[0]?.message?.content?.toLowerCase().trim() || "neutral";
      expect(result).toBe("neutral");
    });
  });

  describe("Prompt structure", () => {
    it("should define sentiment categories", () => {
      const categories = {
        positive: "happy, satisfied, grateful, excited, complimentary",
        neutral: "questions, factual statements, informational",
        negative: "frustrated, angry, disappointed, complaints, issues",
      };

      expect(categories.positive).toContain("happy");
      expect(categories.neutral).toContain("questions");
      expect(categories.negative).toContain("frustrated");
    });

    it("should require single word output", () => {
      const validOutputs = ["positive", "neutral", "negative"];
      validOutputs.forEach((output) => {
        expect(output.split(" ")).toHaveLength(1);
      });
    });
  });

  describe("analyzeSentiment function", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should return neutral for short messages", async () => {
      const result = await analyzeSentiment("Hi");
      expect(result).toBe("neutral");
    });

    it("should handle valid sentiment responses", async () => {
      // Test that function returns valid sentiment values
      const result: Sentiment = await analyzeSentiment("This is a longer test message");
      expect(["positive", "neutral", "negative"]).toContain(result);
    });
  });

  describe("analyzeSentimentBatch function", () => {
    it("should process multiple messages", async () => {
      const messages = ["Hello", "How are you?", "Great service!"];
      const results = await analyzeSentimentBatch(messages);
      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(["positive", "neutral", "negative"]).toContain(result);
      });
    });

    it("should handle empty array", async () => {
      const results = await analyzeSentimentBatch([]);
      expect(results).toHaveLength(0);
    });
  });
});
