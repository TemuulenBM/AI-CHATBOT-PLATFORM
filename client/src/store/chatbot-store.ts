import { create } from 'zustand';

export interface Chatbot {
  id: string;
  name: string;
  url: string;
  status: 'active' | 'training' | 'inactive';
  messages_count: number;
  last_active: string;
}

interface ChatbotStore {
  chatbots: Chatbot[];
  isLoading: boolean;
  addChatbot: (chatbot: Chatbot) => void;
  fetchChatbots: () => Promise<void>;
}

export const useChatbotStore = create<ChatbotStore>((set) => ({
  chatbots: [
    {
      id: '1',
      name: 'Support Bot',
      url: 'https://example.com',
      status: 'active',
      messages_count: 1240,
      last_active: '2 mins ago',
    },
    {
      id: '2',
      name: 'Sales Assistant',
      url: 'https://shop.example.com',
      status: 'training',
      messages_count: 0,
      last_active: 'Just now',
    },
  ],
  isLoading: false,
  addChatbot: (chatbot) => set((state) => ({ chatbots: [...state.chatbots, chatbot] })),
  fetchChatbots: async () => {
    set({ isLoading: true });
    // Mock API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    set({ isLoading: false });
  },
}));
