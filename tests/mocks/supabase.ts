import { vi } from "vitest";

// Mock Supabase client factory
export function createMockSupabaseClient() {
  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
  };

  const mockClient = {
    from: vi.fn().mockReturnValue(mockQueryBuilder),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  };

  return { mockClient, mockQueryBuilder };
}

// Common test data
export const mockUser = {
  id: "user_test123",
  email: "test@example.com",
};

export const mockSubscription = {
  user_id: "user_test123",
  plan: "starter" as const,
  usage: { messages_count: 50, chatbots_count: 1 },
  paddle_customer_id: "ctm_test123",
  paddle_subscription_id: "sub_test123",
  current_period_start: new Date().toISOString(),
  current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
};

export const mockChatbot = {
  id: "chatbot_test123",
  user_id: "user_test123",
  name: "Test Chatbot",
  website_url: "https://example.com",
  status: "ready" as const,
  settings: {
    personality: 50,
    primaryColor: "#007bff",
    welcomeMessage: "Hello! How can I help you?",
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const mockConversation = {
  id: "conv_test123",
  chatbot_id: "chatbot_test123",
  session_id: "session_test123",
  messages: [
    { role: "user" as const, content: "Hello", timestamp: new Date().toISOString() },
    { role: "assistant" as const, content: "Hi there!", timestamp: new Date().toISOString() },
  ],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
