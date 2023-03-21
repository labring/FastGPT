import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { HistoryItem } from '@/types/chat';
import { getChatSiteId } from '@/api/chat';

type Props = {
  chatHistory: HistoryItem[];
  pushChatHistory: (e: HistoryItem) => void;
  updateChatHistory: (chatId: string, title: string) => void;
  removeChatHistoryByWindowId: (chatId: string) => void;
  clearHistory: () => void;
  generateChatWindow: (modelId: string) => Promise<string>;
};
export const useChatStore = create<Props>()(
  devtools(
    persist(
      immer((set, get) => ({
        chatHistory: [],
        pushChatHistory(item: HistoryItem) {
          set((state) => {
            if (state.chatHistory.find((history) => history.chatId === item.chatId)) return;
            state.chatHistory = [item, ...state.chatHistory].slice(0, 20);
          });
        },
        updateChatHistory(chatId: string, title: string) {
          set((state) => {
            state.chatHistory = state.chatHistory.map((item) => ({
              ...item,
              title: item.chatId === chatId ? title : item.title
            }));
          });
        },
        removeChatHistoryByWindowId(chatId: string) {
          set((state) => {
            state.chatHistory = state.chatHistory.filter((item) => item.chatId !== chatId);
          });
        },
        clearHistory() {
          set((state) => {
            state.chatHistory = [];
          });
        },
        generateChatWindow(modelId: string) {
          return getChatSiteId(modelId);
        }
      })),
      {
        name: 'chatHistory'
        // serialize: JSON.stringify,
        // deserialize: (data) => (data ? JSON.parse(data) : []),
      }
    )
  )
);
