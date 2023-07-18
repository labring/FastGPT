import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import type { ChatSiteItemType, ShareChatHistoryItemType, ShareChatType } from '@/types/chat';
import { HUMAN_ICON } from '@/constants/chat';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

type State = {
  shareChatData: ShareChatType;
  setShareChatData: (e: ShareChatType | ((e: ShareChatType) => ShareChatType)) => void;
  shareChatHistory: ShareChatHistoryItemType[];
  saveChatResponse: (e: {
    chatId: string;
    prompts: ChatSiteItemType[];
    variables: Record<string, any>;
    shareId: string;
  }) => { newChatId: string };
  delOneShareHistoryByChatId: (chatId: string) => void;
  delShareChatHistoryItemById: (e: { chatId: string; index: number }) => void;
  delManyShareChatHistoryByShareId: (shareId?: string) => void;
};

export const defaultHistory: ShareChatHistoryItemType = {
  _id: `${Date.now()}`,
  updateTime: new Date(),
  title: '新对话',
  shareId: '',
  chats: []
};
const defaultShareChatData: ShareChatType = {
  maxContext: 5,
  userAvatar: HUMAN_ICON,
  app: {
    name: '',
    avatar: '/icon/logo.png',
    intro: ''
  },
  history: defaultHistory
};

export const useShareChatStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        shareChatData: defaultShareChatData,
        setShareChatData(e) {
          const val = (() => {
            if (typeof e === 'function') {
              return e(get().shareChatData);
            } else {
              return e;
            }
          })();
          set((state) => {
            state.shareChatData = val;
            // update history
            state.shareChatHistory = state.shareChatHistory.map((item) =>
              item._id === val.history._id ? val.history : item
            );
          });
        },
        shareChatHistory: [],
        saveChatResponse({ chatId, prompts, variables, shareId }) {
          const history = get().shareChatHistory.find((item) => item._id === chatId);

          const newChatId = history ? '' : nanoid();

          const historyList = (() => {
            if (history) {
              return get().shareChatHistory.map((item) =>
                item._id === chatId
                  ? {
                      ...item,
                      title: prompts[prompts.length - 2]?.value,
                      updateTime: new Date(),
                      chats: prompts,
                      variables
                    }
                  : item
              );
            }
            return get().shareChatHistory.concat({
              _id: newChatId,
              shareId,
              title: prompts[prompts.length - 2]?.value,
              updateTime: new Date(),
              chats: prompts,
              variables
            });
          })();

          // @ts-ignore
          historyList.sort((a, b) => new Date(b.updateTime) - new Date(a.updateTime));

          set((state) => {
            state.shareChatHistory = historyList.slice(0, 100);
          });

          return {
            newChatId
          };
        },
        delOneShareHistoryByChatId(chatId: string) {
          set((state) => {
            state.shareChatHistory = state.shareChatHistory.filter((item) => item._id !== chatId);
          });
        },
        delShareChatHistoryItemById({ chatId, index }) {
          set((state) => {
            // update history store
            const newHistoryList = state.shareChatHistory.map((item) =>
              item._id === chatId
                ? {
                    ...item,
                    chats: [...item.chats.slice(0, index), ...item.chats.slice(index + 1)]
                  }
                : item
            );
            state.shareChatHistory = newHistoryList;
          });
        },
        delManyShareChatHistoryByShareId(shareId?: string) {
          set((state) => {
            if (shareId) {
              state.shareChatHistory = state.shareChatHistory.filter(
                (item) => item.shareId !== shareId
              );
            } else {
              state.shareChatHistory = [];
            }
          });
        }
      })),
      {
        name: 'shareChatStore',
        partialize: (state) => ({
          shareChatHistory: state.shareChatHistory
        })
      }
    )
  )
);
