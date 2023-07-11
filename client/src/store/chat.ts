import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import { ChatHistoryItemType } from '@/types/chat';
import type { InitChatResponse } from '@/api/response/chat';
import { getChatHistory } from '@/api/chat';
import { HUMAN_ICON } from '@/constants/chat';

type State = {
  history: ChatHistoryItemType[];
  loadHistory: (data: { appId?: string }) => Promise<null>;
  updateHistory: (history: ChatHistoryItemType) => void;
  chatData: InitChatResponse;
  setChatData: (e: InitChatResponse | ((e: InitChatResponse) => InitChatResponse)) => void;
  lastChatAppId: string;
  setLastChatAppId: (id: string) => void;
  lastChatId: string;
  setLastChatId: (id: string) => void;
};

const defaultChatData: InitChatResponse = {
  historyId: '',
  appId: '',
  app: {
    name: '',
    avatar: '/icon/logo.png',
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
        updateHistory(history) {
          const index = get().history.findIndex((item) => item._id === history._id);
          set((state) => {
            if (index > -1) {
              const newHistory = [
                history,
                ...get().history.slice(0, index),
                ...get().history.slice(index + 1)
              ];
              state.history = newHistory;
            } else {
              state.history = [history, ...state.history];
            }
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
