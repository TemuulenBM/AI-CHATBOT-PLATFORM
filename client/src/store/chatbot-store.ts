import { create } from 'zustand';
import { getCsrfHeaders } from '../hooks/use-csrf';

export interface ChatbotSettings {
  primaryColor?: string;
  welcomeMessage?: string;
  personality?: number;
  systemPrompt?: string;

  // Advanced customization options
  position?: "bottom-right" | "bottom-left" | "bottom-center";
  widgetSize?: "compact" | "standard" | "large";
  borderRadius?: number;
  fontFamily?: string;
  headerStyle?: "solid" | "gradient" | "glass";
  showBranding?: boolean;
  openDelay?: number;
  showInitially?: boolean;
  soundEnabled?: boolean;
  animationStyle?: "slide" | "fade" | "bounce" | "none";
}

export type ScrapeFrequency = "manual" | "daily" | "weekly" | "monthly";

export interface ScrapeHistoryEntry {
  id: string;
  chatbot_id: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  pages_scraped: number;
  embeddings_created: number;
  error_message: string | null;
  triggered_by: "manual" | "scheduled" | "initial";
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface ScrapeHistoryResponse {
  history: ScrapeHistoryEntry[];
  lastScrapedAt: string | null;
  scrapeFrequency: ScrapeFrequency;
  autoScrapeEnabled: boolean;
  nextScheduledScrape: string | null;
}

export interface Chatbot {
  id: string;
  name: string;
  website_url: string;
  status: 'pending' | 'scraping' | 'embedding' | 'ready' | 'failed';
  settings: ChatbotSettings;
  pages_scraped: number;
  created_at: string;
  updated_at: string;
  last_scraped_at?: string;
  scrape_frequency?: ScrapeFrequency;
  auto_scrape_enabled?: boolean;
  stats?: {
    embeddings: number;
    conversations: number;
  };
}

export interface ChatbotStats {
  totalChatbots: number;
  totalMessages: number;
  activeChatbots: number;
  totalConversations: number;
  avgResponseTime: number | null;
}

export interface MessageVolumePoint {
  date: string;
  messages: number;
}

export interface ConversationSummary {
  id: string;
  chatbotId?: string;
  chatbotName?: string;
  sessionId: string;
  messageCount: number;
  preview: string;
  createdAt: string;
  updatedAt: string;
}

export interface SentimentBreakdown {
  positive: number;
  neutral: number;
  negative: number;
  total: number;
  positiveRate: number | null;
  negativeRate: number | null;
}

export interface SatisfactionMetrics {
  positive: number;
  negative: number;
  total: number;
  satisfactionRate: number | null;
}

// Phase 5: New Analytics Types
export interface ConversationRateMetrics {
  widgetViews: number;
  widgetOpens: number;
  conversationsStarted: number;
  conversionRate: number;
  openRate: number;
}

export interface ResponseTimeTrendPoint {
  date: string;
  avgResponseTimeMs: number;
  messageCount: number;
}

export interface ChatbotComparisonItem {
  chatbotId: string;
  chatbotName: string;
  totalMessages: number;
  totalConversations: number;
  csatScore: number | null;
  avgResponseTimeMs: number | null;
  conversionRate: number | null;
}

export interface WidgetAnalyticsSummary {
  dailyViews: Array<{ date: string; views: number; opens: number; messages: number }>;
  totalViews: number;
  totalOpens: number;
  totalMessages: number;
}

export interface AnalyticsExportOptions {
  startDate?: string;
  endDate?: string;
  format?: 'csv' | 'json';
  includeConversations?: boolean;
  includeMessages?: boolean;
  includeRatings?: boolean;
}

interface ConversationsResponse {
  conversations: ConversationSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Type for the getToken function from Clerk's useAuth hook
type GetTokenFunction = () => Promise<string | null>;

interface ChatbotStore {
  chatbots: Chatbot[];
  currentChatbot: Chatbot | null;
  stats: ChatbotStats;
  messageVolume: MessageVolumePoint[];
  allConversations: ConversationSummary[];
  conversationsTotal: number;
  conversationsPage: number;
  conversationsTotalPages: number;
  isLoading: boolean;
  isSaving: boolean;
  isRescraping: boolean;
  isExporting: boolean;
  error: string | null;

  // Chatbot comparison data
  chatbotComparison: ChatbotComparisonItem[];

  // Clerk token function
  _getToken: GetTokenFunction | null;
  setGetToken: (getToken: GetTokenFunction) => void;

  fetchChatbots: () => Promise<void>;
  fetchChatbot: (id: string) => Promise<Chatbot | null>;
  fetchStats: () => Promise<void>;
  fetchMessageVolume: (days?: number) => Promise<void>;
  createChatbot: (name: string, websiteUrl: string, settings?: Partial<ChatbotSettings>) => Promise<Chatbot | null>;
  updateChatbot: (id: string, updates: { name?: string; settings?: Partial<ChatbotSettings> }) => Promise<boolean>;
  deleteChatbot: (id: string) => Promise<boolean>;
  fetchSentimentBreakdown: (chatbotId: string) => Promise<SentimentBreakdown | null>;
  fetchSatisfactionMetrics: (chatbotId: string) => Promise<SatisfactionMetrics | null>;
  fetchAllConversations: (page?: number, limit?: number, chatbotId?: string) => Promise<ConversationsResponse | null>;
  triggerRescrape: (chatbotId: string) => Promise<{ success: boolean; message: string }>;
  updateScrapeSchedule: (chatbotId: string, config: { autoScrapeEnabled: boolean; scrapeFrequency: ScrapeFrequency }) => Promise<boolean>;
  fetchScrapeHistory: (chatbotId: string) => Promise<ScrapeHistoryResponse | null>;
  clearError: () => void;
  clearCurrentChatbot: () => void;

  // Phase 5: New Analytics Methods
  fetchConversationRate: (chatbotId: string, days?: number) => Promise<ConversationRateMetrics | null>;
  fetchResponseTimeTrends: (chatbotId: string, days?: number) => Promise<ResponseTimeTrendPoint[] | null>;
  fetchChatbotComparison: () => Promise<ChatbotComparisonItem[] | null>;
  fetchWidgetAnalytics: (chatbotId: string, days?: number) => Promise<WidgetAnalyticsSummary | null>;
  exportAnalytics: (chatbotId: string, options?: AnalyticsExportOptions) => Promise<boolean>;
}

// Helper function to get auth headers from Clerk token and CSRF token
async function getAuthHeaders(getToken: GetTokenFunction | null): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};

  // Add Clerk auth token
  if (getToken) {
    try {
      const token = await getToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // Continue without auth
    }
  }

  // Add CSRF token for state-changing requests
  const csrfHeaders = getCsrfHeaders();
  Object.assign(headers, csrfHeaders);

  return headers;
}

export const useChatbotStore = create<ChatbotStore>((set, get) => ({
  chatbots: [],
  currentChatbot: null,
  stats: {
    totalChatbots: 0,
    totalMessages: 0,
    activeChatbots: 0,
    totalConversations: 0,
    avgResponseTime: null,
  },
  messageVolume: [],
  allConversations: [],
  conversationsTotal: 0,
  conversationsPage: 1,
  conversationsTotalPages: 0,
  isLoading: false,
  isSaving: false,
  isRescraping: false,
  isExporting: false,
  error: null,
  chatbotComparison: [],

  // Clerk token function - will be set by components
  _getToken: null,
  setGetToken: (getToken: GetTokenFunction) => set({ _getToken: getToken }),

  fetchChatbots: async () => {
    set({ isLoading: true, error: null });

    try {
      const headers = await getAuthHeaders(get()._getToken);
      const response = await fetch('/api/chatbots', {
        headers,
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

  fetchChatbot: async (id: string) => {
    set({ isLoading: true, error: null });

    try {
      const headers = await getAuthHeaders(get()._getToken);
      const response = await fetch(`/api/chatbots/${id}`, {
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        set({ isLoading: false, error: data.message || 'Failed to fetch chatbot' });
        return null;
      }

      set({ currentChatbot: data, isLoading: false });
      return data;
    } catch (error) {
      set({ isLoading: false, error: 'Network error. Please try again.' });
      return null;
    }
  },

  fetchStats: async () => {
    try {
      const headers = await getAuthHeaders(get()._getToken);
      const response = await fetch('/api/chatbots/stats', {
        headers,
      });

      const data = await response.json();

      if (response.ok) {
        set({ stats: data });
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  },

  fetchMessageVolume: async (days: number = 7) => {
    try {
      const headers = await getAuthHeaders(get()._getToken);
      const response = await fetch(`/api/chatbots/stats/volume?days=${days}`, {
        headers,
      });

      const data = await response.json();

      if (response.ok && data.volume) {
        set({ messageVolume: data.volume });
      }
    } catch (error) {
      console.error('Failed to fetch message volume:', error);
    }
  },

  createChatbot: async (name: string, websiteUrl: string, settings?: Partial<ChatbotSettings>) => {
    set({ isLoading: true, error: null });

    try {
      const headers = await getAuthHeaders(get()._getToken);
      const response = await fetch('/api/chatbots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ name, websiteUrl, settings }),
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

  updateChatbot: async (id: string, updates: { name?: string; settings?: Partial<ChatbotSettings> }) => {
    set({ isSaving: true, error: null });

    try {
      const headers = await getAuthHeaders(get()._getToken);
      const response = await fetch(`/api/chatbots/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (!response.ok) {
        set({ isSaving: false, error: data.message || 'Failed to update chatbot' });
        return false;
      }

      // Update chatbot in list and current
      set((state) => ({
        chatbots: state.chatbots.map((c) => (c.id === id ? data.chatbot : c)),
        currentChatbot: state.currentChatbot?.id === id ? data.chatbot : state.currentChatbot,
        isSaving: false,
      }));

      return true;
    } catch (error) {
      set({ isSaving: false, error: 'Network error. Please try again.' });
      return false;
    }
  },

  deleteChatbot: async (id: string) => {
    try {
      const headers = await getAuthHeaders(get()._getToken);
      const response = await fetch(`/api/chatbots/${id}`, {
        method: 'DELETE',
        headers,
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
  clearCurrentChatbot: () => set({ currentChatbot: null }),

  triggerRescrape: async (chatbotId: string) => {
    set({ isRescraping: true, error: null });

    try {
      const headers = await getAuthHeaders(get()._getToken);
      const response = await fetch(`/api/chatbots/${chatbotId}/rescrape`, {
        method: 'POST',
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        set({ isRescraping: false, error: data.message || 'Failed to trigger re-scrape' });
        return { success: false, message: data.message || 'Failed to trigger re-scrape' };
      }

      set({ isRescraping: false });
      return { success: true, message: data.message };
    } catch (error) {
      set({ isRescraping: false, error: 'Network error. Please try again.' });
      return { success: false, message: 'Network error. Please try again.' };
    }
  },

  updateScrapeSchedule: async (chatbotId: string, config: { autoScrapeEnabled: boolean; scrapeFrequency: ScrapeFrequency }) => {
    set({ isSaving: true, error: null });

    try {
      const headers = await getAuthHeaders(get()._getToken);
      const response = await fetch(`/api/chatbots/${chatbotId}/scrape-schedule`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(config),
      });

      const data = await response.json();

      if (!response.ok) {
        set({ isSaving: false, error: data.message || 'Failed to update scrape schedule' });
        return false;
      }

      // Update local state
      set((state) => ({
        currentChatbot: state.currentChatbot ? {
          ...state.currentChatbot,
          auto_scrape_enabled: config.autoScrapeEnabled,
          scrape_frequency: config.scrapeFrequency,
        } : null,
        isSaving: false,
      }));

      return true;
    } catch (error) {
      set({ isSaving: false, error: 'Network error. Please try again.' });
      return false;
    }
  },

  fetchScrapeHistory: async (chatbotId: string) => {
    try {
      const headers = await getAuthHeaders(get()._getToken);
      const response = await fetch(`/api/chatbots/${chatbotId}/scrape-history`, {
        headers,
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Failed to fetch scrape history:', error);
    }
    return null;
  },

  fetchSentimentBreakdown: async (chatbotId: string) => {
    try {
      const headers = await getAuthHeaders(get()._getToken);
      const response = await fetch(`/api/chatbots/${chatbotId}/sentiment`, {
        headers,
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Failed to fetch sentiment breakdown:', error);
    }
    return null;
  },

  fetchSatisfactionMetrics: async (chatbotId: string) => {
    try {
      const headers = await getAuthHeaders(get()._getToken);
      const response = await fetch(`/api/chatbots/${chatbotId}/satisfaction`, {
        headers,
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Failed to fetch satisfaction metrics:', error);
    }
    return null;
  },

  fetchAllConversations: async (page: number = 1, limit: number = 20, chatbotId?: string) => {
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (chatbotId) {
        params.append('chatbotId', chatbotId);
      }

      const headers = await getAuthHeaders(get()._getToken);
      const response = await fetch(`/api/chatbots/conversations?${params.toString()}`, {
        headers,
      });

      if (response.ok) {
        const data: ConversationsResponse = await response.json();
        set({
          allConversations: data.conversations,
          conversationsTotal: data.total,
          conversationsPage: data.page,
          conversationsTotalPages: data.totalPages,
          isLoading: false,
        });
        return data;
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Failed to fetch conversations' }));
        set({
          isLoading: false,
          error: errorData.message || 'Failed to fetch conversations'
        });
      }
    } catch (error) {
      console.error('Failed to fetch all conversations:', error);
      set({
        isLoading: false,
        error: 'Network error. Please try again.'
      });
    }
    return null;
  },

  // Phase 5: New Analytics Methods

  fetchConversationRate: async (chatbotId: string, days: number = 30) => {
    try {
      const headers = await getAuthHeaders(get()._getToken);
      const response = await fetch(`/api/chatbots/${chatbotId}/analytics/conversation-rate?days=${days}`, {
        headers,
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Failed to fetch conversation rate:', error);
    }
    return null;
  },

  fetchResponseTimeTrends: async (chatbotId: string, days: number = 7) => {
    try {
      const headers = await getAuthHeaders(get()._getToken);
      const response = await fetch(`/api/chatbots/${chatbotId}/analytics/response-times?days=${days}`, {
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        return data.trends;
      }
    } catch (error) {
      console.error('Failed to fetch response time trends:', error);
    }
    return null;
  },

  fetchChatbotComparison: async () => {
    try {
      const headers = await getAuthHeaders(get()._getToken);
      const response = await fetch('/api/analytics/compare', {
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        set({ chatbotComparison: data.chatbots });
        return data.chatbots;
      }
    } catch (error) {
      console.error('Failed to fetch chatbot comparison:', error);
    }
    return null;
  },

  fetchWidgetAnalytics: async (chatbotId: string, days: number = 7) => {
    try {
      const headers = await getAuthHeaders(get()._getToken);
      const response = await fetch(`/api/chatbots/${chatbotId}/analytics/widget?days=${days}`, {
        headers,
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Failed to fetch widget analytics:', error);
    }
    return null;
  },

  exportAnalytics: async (chatbotId: string, options: AnalyticsExportOptions = {}) => {
    set({ isExporting: true, error: null });
    try {
      const params = new URLSearchParams();

      if (options.format) params.append('format', options.format);
      if (options.startDate) params.append('startDate', options.startDate);
      if (options.endDate) params.append('endDate', options.endDate);
      if (options.includeConversations !== undefined) {
        params.append('includeConversations', String(options.includeConversations));
      }
      if (options.includeMessages !== undefined) {
        params.append('includeMessages', String(options.includeMessages));
      }
      if (options.includeRatings !== undefined) {
        params.append('includeRatings', String(options.includeRatings));
      }

      const headers = await getAuthHeaders(get()._getToken);
      const response = await fetch(`/api/chatbots/${chatbotId}/analytics/export?${params.toString()}`, {
        headers,
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type');

        if (options.format === 'csv' || contentType?.includes('text/csv')) {
          // Download CSV file
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = response.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '')
            || `analytics_${new Date().toISOString().split('T')[0]}.csv`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        } else {
          // Download JSON file
          const data = await response.json();
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `analytics_${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }

        set({ isExporting: false });
        return true;
      } else {
        const errorData = await response.json().catch(() => ({ message: 'Failed to export analytics' }));
        set({ isExporting: false, error: errorData.message || 'Failed to export analytics' });
      }
    } catch (error) {
      console.error('Failed to export analytics:', error);
      set({ isExporting: false, error: 'Network error. Please try again.' });
    }
    return false;
  },
}));
