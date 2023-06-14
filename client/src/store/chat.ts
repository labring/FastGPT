import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { OpenAiChatEnum } from '@/constants/model';

import {
  ChatSiteItemType,
  HistoryItemType,
  ShareChatHistoryItemType,
  ChatType,
  ShareChatType
} from '@/types/chat';
import { getChatHistory } from '@/api/chat';
import { HUMAN_ICON } from '@/constants/chat';

type SetShareChatHistoryItem = {
  historyId: string;
  shareId: string;
  title: string;
  latestChat: string;
  chats: ChatSiteItemType[];
};

type State = {
  history: HistoryItemType[];
  loadHistory: (data: { pageNum: number; init?: boolean }) => Promise<null>;
  forbidLoadChatData: boolean;
  setForbidLoadChatData: (val: boolean) => void;
  chatData: ChatType;
  setChatData: (e?: ChatType | ((e: ChatType) => ChatType)) => void;
  lastChatModelId: string;
  setLastChatModelId: (id: string) => void;
  lastChatId: string;
  setLastChatId: (id: string) => void;

  shareChatData: ShareChatType;
  setShareChatData: (e?: ShareChatType | ((e: ShareChatType) => ShareChatType)) => void;
  password: string;
  setPassword: (val: string) => void;
  shareChatHistory: ShareChatHistoryItemType[];
  setShareChatHistory: (e: SetShareChatHistoryItem) => void;
  delShareHistoryById: (historyId: string) => void;
  delShareChatHistoryItemById: (historyId: string, index: number) => void;
  delShareChatHistory: (shareId?: string) => void;
};

const defaultChatData = {
  chatId: 'chatId',
  modelId: 'modelId',
  model: {
    name: '',
    avatar: '/icon/logo.png',
    intro: '',
    canUse: false
  },
  chatModel: OpenAiChatEnum.GPT3516k,
  history: []
};
const defaultShareChatData: ShareChatType = {
  maxContext: 5,
  userAvatar: HUMAN_ICON,
  model: {
    name: '',
    avatar: '/icon/logo.png',
    intro: ''
  },
  chatModel: OpenAiChatEnum.GPT3516k,
  history: []
};

export const useChatStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        lastChatModelId: '',
        setLastChatModelId(id: string) {
          set((state) => {
            state.lastChatModelId = id;
          });
        },
        lastChatId: '',
        setLastChatId(id: string) {
          set((state) => {
            state.lastChatId = id;
          });
        },
        history: [],
        async loadHistory({ pageNum, init = false }: { pageNum: number; init?: boolean }) {
          if (get().history.length > 0 && !init) return null;
          const data = await getChatHistory({
            pageNum,
            pageSize: 20
          });
          set((state) => {
            state.history = data;
          });
          return null;
        },
        forbidLoadChatData: false,
        setForbidLoadChatData(val: boolean) {
          set((state) => {
            state.forbidLoadChatData = val;
          });
        },
        chatData: defaultChatData,
        setChatData(e: ChatType | ((e: ChatType) => ChatType) = defaultChatData) {
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
        shareChatData: defaultShareChatData,
        setShareChatData(
          e: ShareChatType | ((e: ShareChatType) => ShareChatType) = defaultShareChatData
        ) {
          if (typeof e === 'function') {
            set((state) => {
              state.shareChatData = e(state.shareChatData);
            });
          } else {
            set((state) => {
              state.shareChatData = e;
            });
          }
        },
        password: '',
        setPassword(val: string) {
          set((state) => {
            state.password = val;
          });
        },
        shareChatHistory: [],
        setShareChatHistory({
          historyId,
          shareId,
          title,
          latestChat,
          chats = []
        }: SetShareChatHistoryItem) {
          set((state) => {
            const history = state.shareChatHistory.find((item) => item._id === historyId);
            let historyList: ShareChatHistoryItemType[] = [];
            if (history) {
              historyList = state.shareChatHistory.map((item) =>
                item._id === historyId
                  ? {
                      ...item,
                      title,
                      latestChat,
                      updateTime: new Date(),
                      chats
                    }
                  : item
              );
            } else {
              historyList = [
                ...state.shareChatHistory,
                {
                  _id: historyId,
                  shareId,
                  title,
                  latestChat,
                  updateTime: new Date(),
                  chats
                }
              ];
            }

            // @ts-ignore
            historyList.sort((a, b) => new Date(b.updateTime) - new Date(a.updateTime));

            state.shareChatHistory = historyList.slice(0, 30);
          });
        },
        delShareHistoryById(historyId: string) {
          set((state) => {
            state.shareChatHistory = state.shareChatHistory.filter(
              (item) => item._id !== historyId
            );
          });
        },
        delShareChatHistoryItemById(historyId: string, index: number) {
          set((state) => {
            // update history store
            const newHistoryList = state.shareChatHistory.map((item) =>
              item._id === historyId
                ? {
                    ...item,
                    chats: [...item.chats.slice(0, index), ...item.chats.slice(index + 1)]
                  }
                : item
            );
            state.shareChatHistory = newHistoryList;

            // update chatData
            state.shareChatData.history =
              newHistoryList.find((item) => item._id === historyId)?.chats || [];
          });
        },
        delShareChatHistory(shareId?: string) {
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
        name: 'chatStore',
        partialize: (state) => ({
          lastChatModelId: state.lastChatModelId,
          lastChatId: state.lastChatId,
          password: state.password,
          shareChatHistory: state.shareChatHistory
        })
      }
    )
  )
);
