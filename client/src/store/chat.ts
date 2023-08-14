import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import { ChatHistoryItemType } from '@/types/chat';
import type { InitChatResponse } from '@/api/response/chat';
import { delChatHistoryById, getChatHistory, clearChatHistoryByAppId } from '@/api/chat';

type State = {
  history: ChatHistoryItemType[];
  loadHistory: (data: { appId?: string }) => Promise<null>;
  delHistory(history: string): Promise<void>;
  clearHistory(appId: string): Promise<void>;
  updateHistory: (history: ChatHistoryItemType) => void;
  chatData: InitChatResponse;
  setChatData: (e: InitChatResponse | ((e: InitChatResponse) => InitChatResponse)) => void;
  lastChatAppId: string;
  setLastChatAppId: (id: string) => void;
  lastChatId: string;
  setLastChatId: (id: string) => void;
};

const defaultChatData: InitChatResponse = {
  chatId: '',
  appId: '',
  app: {
    name: 'FastGPT',
    avatar: '/icon/logo.svg',
    intro: '',
    canUse: false
  },
  title: '新对话',
  variables: {},
  history: []
};

export const useChatStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        lastChatAppId: '',
        setLastChatAppId(id: string) {
          set((state) => {
            state.lastChatAppId = id;
          });
        },
        lastChatId: '',
        setLastChatId(id: string) {
          set((state) => {
            state.lastChatId = id;
          });
        },
        history: [],
        async loadHistory({ appId }) {
          const oneHistory = get().history[0];
          if (oneHistory && oneHistory.appId === appId) return null;
          const data = await getChatHistory({
            appId,
            pageNum: 1,
            pageSize: 20
          });
          set((state) => {
            state.history = data;
          });
          return null;
        },
        async delHistory(chatId) {
          set((state) => {
            state.history = state.history.filter((item) => item.chatId !== chatId);
          });
          await delChatHistoryById(chatId);
        },
        async clearHistory(appId) {
          set((state) => {
            state.history = [];
          });
          await clearChatHistoryByAppId(appId);
        },
        updateHistory(history) {
          const index = get().history.findIndex((item) => item.chatId === history.chatId);
          set((state) => {
            const newHistory = (() => {
              if (index > -1) {
                return [
                  history,
                  ...get().history.slice(0, index),
                  ...get().history.slice(index + 1)
                ];
              } else {
                return [history, ...state.history];
              }
            })();

            state.history = newHistory;
          });
        },
        chatData: defaultChatData,
        setChatData(e = defaultChatData) {
          if (typeof e === 'function') {
            set((state) => {
              state.chatData = e(state.chatData);
            });
          } else {
            set((state) => {
              state.chatData = e;
            });
          }
        }
      })),
      {
        name: 'chatStore',
        partialize: (state) => ({
          lastChatAppId: state.lastChatAppId,
          lastChatId: state.lastChatId
        })
      }
    )
  )
);
