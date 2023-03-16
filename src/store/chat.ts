import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { HistoryItem } from '@/types/chat';
import { getChatSiteId } from '@/api/chat';

type Props = {
  chatHistory: HistoryItem[];
  pushChatHistory: (e: HistoryItem) => void;
  updateChatHistory: (windowId: string, title: string) => void;
  removeChatHistoryByWindowId: (windowId: string) => void;
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
        updateChatHistory(windowId: string, title: string) {
          set((state) => {
            state.chatHistory = state.chatHistory.map((item) => ({
              ...item,
              title: item.windowId === windowId ? title : item.title
            }));
          });
        },
        removeChatHistoryByWindowId(windowId: string) {
          set((state) => {
            state.chatHistory = state.chatHistory.filter((item) => item.windowId !== windowId);
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
