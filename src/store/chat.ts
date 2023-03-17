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
  generateChatWindow: (modelId: string) => Promise<string>;
};
export const useChatStore = create<Props>()(
  devtools(
    persist(
      immer((set, get) => ({
        chatHistory: [],
        pushChatHistory(item: HistoryItem) {
          set((state) => {
            state.chatHistory = [item, ...state.chatHistory];
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
