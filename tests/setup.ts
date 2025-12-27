import { vi, beforeAll, afterAll, afterEach } from "vitest";

// Mock environment variables for tests
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "test-service-key";
process.env.CLERK_SECRET_KEY = "test-clerk-secret";
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.PADDLE_API_KEY = "test-paddle-key";
process.env.PADDLE_WEBHOOK_SECRET = "test-webhook-secret";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.PADDLE_ENVIRONMENT = "sandbox";

// Mock logger to prevent console noise during tests
vi.mock("../server/utils/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
  logAuth: vi.fn(),
  logChatbot: vi.fn(),
  logJob: vi.fn(),
  logPayment: vi.fn(),
  logApiError: vi.fn(),
  logChat: vi.fn(),
  logPerformance: vi.fn(),
}));

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Global cleanup
afterAll(() => {
  vi.restoreAllMocks();
});
