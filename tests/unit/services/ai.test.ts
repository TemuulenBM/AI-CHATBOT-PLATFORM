import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AIService, requiresMaxCompletionTokens } from "../../../server/services/ai";

// Mock external dependencies
vi.mock("openai", () => {
  const mockChat = {
    completions: {
      create: vi.fn().mockResolvedValue({
        choices: [{ message: { content: "Mock response" } }],
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

vi.mock("@anthropic-ai/sdk", () => {
  const mockMessages = {
    create: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Mock Anthropic response" }],
    }),
    stream: vi.fn(),
  };

  return {
    default: class {
      messages = mockMessages;
      constructor() {
        return this;
      }
    },
  };
});

vi.mock("../../../server/services/embedding", () => ({
  embeddingService: {
    findSimilar: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../../server/services/knowledge-base", () => ({
  knowledgeBaseService: {
    searchKnowledgeBase: vi.fn().mockResolvedValue([]),
  },
}));

describe("AI Service", () => {
  let aiService: AIService;

  beforeEach(() => {
    aiService = new AIService();
    vi.clearAllMocks();
  });

  describe("requiresMaxCompletionTokens", () => {
    it("should return true for GPT-5 models", () => {
      expect(requiresMaxCompletionTokens("gpt-5-mini")).toBe(true);
      expect(requiresMaxCompletionTokens("gpt-5-turbo")).toBe(true);
      expect(requiresMaxCompletionTokens("gpt-5")).toBe(true);
    });

    it("should return true for o1 models", () => {
      expect(requiresMaxCompletionTokens("o1-preview")).toBe(true);
      expect(requiresMaxCompletionTokens("o1-mini")).toBe(true);
    });

    it("should return false for GPT-4 models", () => {
      expect(requiresMaxCompletionTokens("gpt-4")).toBe(false);
      expect(requiresMaxCompletionTokens("gpt-4-turbo")).toBe(false);
      expect(requiresMaxCompletionTokens("gpt-4o")).toBe(false);
    });

    it("should return false for GPT-3.5 models", () => {
      expect(requiresMaxCompletionTokens("gpt-3.5-turbo")).toBe(false);
    });
  });

  describe("buildSystemPrompt", () => {
    it("should build professional prompt for low personality", () => {
      const prompt = aiService.buildSystemPrompt(
        "TestSite",
        { personality: 20 } as any,
        ""
      );

      expect(prompt).toContain("professional and formal");
      expect(prompt).toContain("TestSite");
    });

    it("should build friendly prompt for high personality", () => {
      const prompt = aiService.buildSystemPrompt(
        "TestSite",
        { personality: 80 } as any,
        ""
      );

      expect(prompt).toContain("friendly and casual");
    });

    it("should build balanced prompt for medium personality", () => {
      const prompt = aiService.buildSystemPrompt(
        "TestSite",
        { personality: 50 } as any,
        ""
      );

      expect(prompt).toContain("balanced and helpful");
    });

    it("should use custom system prompt when provided", () => {
      const customPrompt = "You are a custom assistant";
      const prompt = aiService.buildSystemPrompt(
        "TestSite",
        { personality: 50, systemPrompt: customPrompt } as any,
        ""
      );

      expect(prompt).toContain(customPrompt);
    });

    it("should include KERNEL framework sections with context", () => {
      const context = "Some knowledge base content";
      const prompt = aiService.buildSystemPrompt(
        "TestSite",
        { personality: 50 } as any,
        context
      );

      expect(prompt).toContain("## INPUT");
      expect(prompt).toContain("## TASK");
      expect(prompt).toContain("## CONSTRAINTS");
      expect(prompt).toContain("## OUTPUT FORMAT");
      expect(prompt).toContain(context);
    });

    it("should include training mode instructions without context", () => {
      const prompt = aiService.buildSystemPrompt(
        "TestSite",
        { personality: 50 } as any,
        ""
      );

      expect(prompt).toContain("## TASK");
      expect(prompt).toContain("## CONSTRAINTS");
      expect(prompt).toContain("Do not fabricate specific details");
    });

    it("should mention source citations in trained mode", () => {
      const prompt = aiService.buildSystemPrompt(
        "TestSite",
        { personality: 50 } as any,
        "Knowledge content"
      );

      expect(prompt).toContain("Cite sources");
    });

    it("should set word limit based on context presence", () => {
      const trainedPrompt = aiService.buildSystemPrompt(
        "TestSite",
        { personality: 50 } as any,
        "Content"
      );

      const trainingPrompt = aiService.buildSystemPrompt(
        "TestSite",
        { personality: 50 } as any,
        ""
      );

      expect(trainedPrompt).toContain("200 words");
      expect(trainingPrompt).toContain("150 words");
    });
  });

  describe("buildContext", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("should return empty context when no matches found", async () => {
      const { knowledgeBaseService } = await import("../../../server/services/knowledge-base");
      const { embeddingService } = await import("../../../server/services/embedding");

      vi.mocked(knowledgeBaseService.searchKnowledgeBase).mockResolvedValue([]);
      vi.mocked(embeddingService.findSimilar).mockResolvedValue([]);

      const context = await aiService.buildContext("chatbot123", "Hello");

      expect(context.relevantContent).toBe("");
      expect(context.sources).toHaveLength(0);
    });

    it("should use manual knowledge base when high similarity match found", async () => {
      const { knowledgeBaseService } = await import("../../../server/services/knowledge-base");

      vi.mocked(knowledgeBaseService.searchKnowledgeBase).mockResolvedValue([
        {
          id: "kb1",
          question: "What is your return policy?",
          answer: "We offer 30-day returns",
          category: null,
          priority: 0,
          similarity: 0.95,
        },
      ]);

      const context = await aiService.buildContext("chatbot123", "return policy");

      expect(context.relevantContent).toBe("We offer 30-day returns");
      expect(context.isManualKnowledge).toBe(true);
      expect(context.sources).toContain("Knowledge Base: What is your return policy?");
    });

    it("should fall back to embeddings when KB match is low similarity", async () => {
      const { knowledgeBaseService } = await import("../../../server/services/knowledge-base");
      const { embeddingService } = await import("../../../server/services/embedding");

      vi.mocked(knowledgeBaseService.searchKnowledgeBase).mockResolvedValue([
        {
          id: "kb1",
          question: "What is your return policy?",
          answer: "We offer 30-day returns",
          category: null,
          priority: 0,
          similarity: 0.5, // Below 0.8 threshold
        },
      ]);
      vi.mocked(embeddingService.findSimilar).mockResolvedValue([
        { content: "Embedding content 1", pageUrl: "https://example.com/page1", similarity: 0.7 },
        { content: "Embedding content 2", pageUrl: "https://example.com/page2", similarity: 0.65 },
      ]);

      const context = await aiService.buildContext("chatbot123", "some question");

      expect(context.relevantContent).toContain("[1] Embedding content 1");
      expect(context.relevantContent).toContain("[2] Embedding content 2");
      expect(context.isManualKnowledge).toBe(false);
      expect(context.sources).toContain("https://example.com/page1");
    });

    it("should deduplicate page URLs in sources", async () => {
      const { knowledgeBaseService } = await import("../../../server/services/knowledge-base");
      const { embeddingService } = await import("../../../server/services/embedding");

      vi.mocked(knowledgeBaseService.searchKnowledgeBase).mockResolvedValue([]);
      vi.mocked(embeddingService.findSimilar).mockResolvedValue([
        { content: "Content 1", pageUrl: "https://example.com/page1", similarity: 0.7 },
        { content: "Content 2", pageUrl: "https://example.com/page1", similarity: 0.65 }, // Same URL
      ]);

      const context = await aiService.buildContext("chatbot123", "question");

      expect(context.sources).toHaveLength(1);
      expect(context.sources).toContain("https://example.com/page1");
    });

    it("should handle errors gracefully and return empty context", async () => {
      const { knowledgeBaseService } = await import("../../../server/services/knowledge-base");

      vi.mocked(knowledgeBaseService.searchKnowledgeBase).mockRejectedValue(
        new Error("DB error")
      );

      const context = await aiService.buildContext("chatbot123", "question");

      expect(context.relevantContent).toBe("");
      expect(context.sources).toHaveLength(0);
    });
  });

  describe("getChatResponse", () => {
    it("should call OpenAI by default", async () => {
      const context = { relevantContent: "", sources: [] };
      const history: any[] = [];
      const settings = { personality: 50 } as any;

      const response = await aiService.getChatResponse(
        "Hello",
        context,
        history,
        settings,
        "TestSite"
      );

      expect(response).toBeDefined();
    });

    it("should use anthropic provider when specified", async () => {
      const context = { relevantContent: "", sources: [] };
      const history: any[] = [];
      const settings = { personality: 50 } as any;

      const response = await aiService.getChatResponse(
        "Hello",
        context,
        history,
        settings,
        "TestSite",
        { provider: "anthropic" }
      );

      expect(response).toBeDefined();
    });

    it("should handle conversation history", async () => {
      const context = { relevantContent: "", sources: [] };
      const history = [
        { role: "user" as const, content: "Previous question", timestamp: new Date().toISOString() },
        { role: "assistant" as const, content: "Previous answer", timestamp: new Date().toISOString() },
      ];
      const settings = { personality: 50 } as any;

      const response = await aiService.getChatResponse(
        "Follow up question",
        context,
        history,
        settings,
        "TestSite"
      );

      expect(response).toBeDefined();
    });
  });
});

describe("AI Service - Model Parameter Tests", () => {
  describe("GPT-5 series parameter handling", () => {
    it("should use max_completion_tokens for gpt-5-mini", () => {
      const model = "gpt-5-mini";
      const usesMaxCompletion = requiresMaxCompletionTokens(model);

      expect(usesMaxCompletion).toBe(true);
    });

    it("should not add temperature for GPT-5 models", () => {
      const model = "gpt-5-mini";
      const shouldAddTemperature = !requiresMaxCompletionTokens(model);

      expect(shouldAddTemperature).toBe(false);
    });
  });

  describe("Legacy model parameter handling", () => {
    it("should use max_tokens for gpt-4", () => {
      const model = "gpt-4";
      const usesMaxCompletion = requiresMaxCompletionTokens(model);

      expect(usesMaxCompletion).toBe(false);
    });

    it("should add temperature for legacy models", () => {
      const model = "gpt-4";
      const shouldAddTemperature = !requiresMaxCompletionTokens(model);

      expect(shouldAddTemperature).toBe(true);
    });
  });
});
