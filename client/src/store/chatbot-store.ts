import { create } from 'zustand';
import { getAuthHeader } from './authStore';

export interface Chatbot {
  id: string;
  name: string;
  website_url: string;
  status: 'pending' | 'scraping' | 'embedding' | 'ready' | 'failed';
  settings: {
    primaryColor?: string;
    welcomeMessage?: string;
    personality?: string;
  };
  pages_scraped: number;
  created_at: string;
  updated_at: string;
}

export interface ChatbotStats {
  totalChatbots: number;
  totalMessages: number;
  activeChatbots: number;
  totalConversations: number;
}

interface ChatbotStore {
  chatbots: Chatbot[];
  stats: ChatbotStats;
  isLoading: boolean;
  error: string | null;

  fetchChatbots: () => Promise<void>;
  fetchStats: () => Promise<void>;
  createChatbot: (name: string, websiteUrl: string) => Promise<Chatbot | null>;
  deleteChatbot: (id: string) => Promise<boolean>;
  clearError: () => void;
}

export const useChatbotStore = create<ChatbotStore>((set, get) => ({
  chatbots: [],
  stats: {
    totalChatbots: 0,
    totalMessages: 0,
    activeChatbots: 0,
    totalConversations: 0,
  },
  isLoading: false,
  error: null,

  fetchChatbots: async () => {
    set({ isLoading: true, error: null });

    try {
      const response = await fetch('/api/chatbots', {
        headers: {
          ...getAuthHeader(),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        set({ isLoading: false, error: data.message || 'Failed to fetch chatbots' });
        return;
      }

      set({ chatbots: data.chatbots, isLoading: false });
    } catch (error) {
      set({ isLoading: false, error: 'Network error. Please try again.' });
    }
  },

  fetchStats: async () => {
    try {
      const response = await fetch('/api/chatbots/stats', {
        headers: {
          ...getAuthHeader(),
        },
      });

      const data = await response.json();

      if (response.ok) {
        set({ stats: data });
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  },

  createChatbot: async (name: string, websiteUrl: string) => {
    set({ isLoading: true, error: null });

    try {
      const response = await fetch('/api/chatbots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ name, websiteUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        set({ isLoading: false, error: data.message || 'Failed to create chatbot' });
        return null;
      }

      // Add new chatbot to list
      set((state) => ({
        chatbots: [data.chatbot, ...state.chatbots],
        isLoading: false,
      }));

      return data.chatbot;
    } catch (error) {
      set({ isLoading: false, error: 'Network error. Please try again.' });
      return null;
    }
  },

  deleteChatbot: async (id: string) => {
    try {
      const response = await fetch(`/api/chatbots/${id}`, {
        method: 'DELETE',
        headers: {
          ...getAuthHeader(),
        },
      });

      if (!response.ok) {
        return false;
      }

      // Remove chatbot from list
      set((state) => ({
        chatbots: state.chatbots.filter((c) => c.id !== id),
      }));

      return true;
    } catch (error) {
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));
