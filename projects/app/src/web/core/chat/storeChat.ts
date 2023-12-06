import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { ChatHistoryItemType } from '@fastgpt/global/core/chat/type.d';
import type {
  InitChatResponse,
  getHistoriesProps,
  ClearHistoriesProps,
  DelHistoryProps
} from '@/global/core/chat/api';
import {
  delChatHistoryById,
  getChatHistories,
  clearChatHistoryByAppId,
  delChatRecordById
} from '@/web/core/chat/api';
import { defaultChatData } from '@/global/core/chat/constants';

type State = {
  history: ChatHistoryItemType[];
  loadHistory: (data: getHistoriesProps) => Promise<null>;
  delOneHistory(data: DelHistoryProps): Promise<void>;
  clearHistories(data: ClearHistoriesProps): Promise<void>;
  updateHistory: (history: ChatHistoryItemType) => void;
  chatData: InitChatResponse;
  setChatData: (e: InitChatResponse | ((e: InitChatResponse) => InitChatResponse)) => void;
  lastChatAppId: string;
  setLastChatAppId: (id: string) => void;
  lastChatId: string;
  setLastChatId: (id: string) => void;
  delOneHistoryItem: (e: { chatId: string; contentId?: string; index: number }) => Promise<any>;
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
        async loadHistory(e) {
          const data = await getChatHistories(e);
          set((state) => {
            state.history = data;
          });
          return null;
        },
        async delOneHistory(props) {
          set((state) => {
            state.history = state.history.filter((item) => item.chatId !== props.chatId);
          });
          await delChatHistoryById(props);
        },
        async clearHistories(data) {
          set((state) => {
            state.history = [];
          });
          await clearChatHistoryByAppId(data);
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
        },
        async delOneHistoryItem({ chatId, contentId, index }) {
          if (!chatId || !contentId) return;

          try {
            get().setChatData((state) => ({
              ...state,
              history: state.history.filter((_, i) => i !== index)
            }));
            await delChatRecordById({ chatId, contentId });
          } catch (err) {
            console.log(err);
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
