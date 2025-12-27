import { vi } from "vitest";

// Mock Redis cache
const mockCache = new Map<string, { value: unknown; expiresAt: number }>();

export const mockRedis = {
  getCache: vi.fn(async <T>(key: string): Promise<T | null> => {
    const cached = mockCache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      mockCache.delete(key);
      return null;
    }
    return cached.value as T;
  }),

  setCache: vi.fn(async (key: string, value: unknown, ttlSeconds: number = 300): Promise<void> => {
    mockCache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }),

  deleteCache: vi.fn(async (key: string): Promise<void> => {
    mockCache.delete(key);
  }),

  clearMockCache: () => {
    mockCache.clear();
  },
};

export function createMockRedis() {
  return mockRedis;
}
