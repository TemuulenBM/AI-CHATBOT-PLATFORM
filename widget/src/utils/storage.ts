/**
 * Storage utilities with fallback support
 */

import { UserIdentity } from "../types";

const STORAGE_PREFIX = "convoai_";

class StorageManager {
  private available: boolean = false;
  private memoryStorage: Map<string, string> = new Map();

  constructor() {
    this.available = this.checkAvailability();
  }

  private checkAvailability(): boolean {
    try {
      const testKey = `${STORAGE_PREFIX}test`;
      localStorage.setItem(testKey, "1");
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  private getKey(key: string, chatbotId: string): string {
    return `${STORAGE_PREFIX}${chatbotId}_${key}`;
  }

  get(key: string, chatbotId: string): string | null {
    const fullKey = this.getKey(key, chatbotId);

    if (this.available) {
      try {
        return localStorage.getItem(fullKey);
      } catch {
        return this.memoryStorage.get(fullKey) || null;
      }
    }

    return this.memoryStorage.get(fullKey) || null;
  }

  set(key: string, chatbotId: string, value: string): void {
    const fullKey = this.getKey(key, chatbotId);

    if (this.available) {
      try {
        localStorage.setItem(fullKey, value);
        return;
      } catch {
        // Fall through to memory storage
      }
    }

    this.memoryStorage.set(fullKey, value);
  }

  remove(key: string, chatbotId: string): void {
    const fullKey = this.getKey(key, chatbotId);

    if (this.available) {
      try {
        localStorage.removeItem(fullKey);
      } catch {
        // Ignore
      }
    }

    this.memoryStorage.delete(fullKey);
  }

  // Session ID management
  getSessionId(chatbotId: string): string {
    let sessionId = this.get("session", chatbotId);

    if (!sessionId) {
      sessionId = "session_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      this.set("session", chatbotId, sessionId);
    }

    return sessionId;
  }

  clearSession(chatbotId: string): string {
    this.remove("session", chatbotId);
    return this.getSessionId(chatbotId);
  }

  // Unread count management
  getUnreadCount(chatbotId: string): number {
    const count = this.get("unread", chatbotId);
    return count ? parseInt(count, 10) : 0;
  }

  setUnreadCount(chatbotId: string, count: number): void {
    this.set("unread", chatbotId, count.toString());
  }

  incrementUnread(chatbotId: string): number {
    const current = this.getUnreadCount(chatbotId);
    const newCount = current + 1;
    this.setUnreadCount(chatbotId, newCount);
    return newCount;
  }

  clearUnread(chatbotId: string): void {
    this.setUnreadCount(chatbotId, 0);
  }

  // User identity management
  getUserIdentity(chatbotId: string): UserIdentity | null {
    const data = this.get("identity", chatbotId);
    if (data) {
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    }
    return null;
  }

  setUserIdentity(chatbotId: string, identity: UserIdentity): void {
    this.set("identity", chatbotId, JSON.stringify(identity));
  }

  // Pre-chat form completion tracking
  hasCompletedPreChat(chatbotId: string): boolean {
    return this.get("prechat_completed", chatbotId) === "true";
  }

  setPreChatCompleted(chatbotId: string): void {
    this.set("prechat_completed", chatbotId, "true");
  }

  // Proactive message tracking (prevent showing same message twice)
  hasSeenProactive(chatbotId: string, triggerId: string): boolean {
    const seen = this.get("proactive_seen", chatbotId);
    if (seen) {
      const ids = seen.split(",");
      return ids.includes(triggerId);
    }
    return false;
  }

  markProactiveSeen(chatbotId: string, triggerId: string): void {
    const seen = this.get("proactive_seen", chatbotId);
    const ids = seen ? seen.split(",") : [];
    if (!ids.includes(triggerId)) {
      ids.push(triggerId);
      this.set("proactive_seen", chatbotId, ids.join(","));
    }
  }

  // Feedback tracking
  hasFeedbackSubmitted(chatbotId: string, conversationId: string): boolean {
    return this.get(`feedback_${conversationId}`, chatbotId) === "true";
  }

  setFeedbackSubmitted(chatbotId: string, conversationId: string): void {
    this.set(`feedback_${conversationId}`, chatbotId, "true");
  }

  // Widget state
  getWidgetOpen(chatbotId: string): boolean {
    return this.get("widget_open", chatbotId) === "true";
  }

  setWidgetOpen(chatbotId: string, open: boolean): void {
    this.set("widget_open", chatbotId, open.toString());
  }
}

// Singleton instance
export const storage = new StorageManager();
