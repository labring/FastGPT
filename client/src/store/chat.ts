import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { OpenAiChatEnum } from '@/constants/model';

import { ChatSiteItemType, HistoryItemType, ChatType } from '@/types/chat';
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
};

const defaultChatData: ChatType = {
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
        }
      })),
      {
        name: 'chatStore',
        partialize: (state) => ({
          lastChatModelId: state.lastChatModelId,
          lastChatId: state.lastChatId
        })
      }
    )
  )
);
