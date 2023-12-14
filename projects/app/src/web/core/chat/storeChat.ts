import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { ChatHistoryItemType } from '@fastgpt/global/core/chat/type.d';
import type {
  InitChatResponse,
  getHistoriesProps,
  ClearHistoriesProps,
  DelHistoryProps,
  UpdateHistoryProps,
  DeleteChatItemProps
} from '@/global/core/chat/api';
import {
  delChatHistoryById,
  getChatHistories,
  clearChatHistoryByAppId,
  delChatRecordById,
  putChatHistory
} from '@/web/core/chat/api';
import { defaultChatData } from '@/global/core/chat/constants';

type State = {
  histories: ChatHistoryItemType[];
  loadHistories: (data: getHistoriesProps) => Promise<null>;
  delOneHistory(data: DelHistoryProps): Promise<void>;
  clearHistories(data: ClearHistoriesProps): Promise<void>;
  pushHistory: (history: ChatHistoryItemType) => void;
  updateHistory: (e: UpdateHistoryProps & { updateTime?: Date; title?: string }) => Promise<any>;
  chatData: InitChatResponse;
  setChatData: (e: InitChatResponse | ((e: InitChatResponse) => InitChatResponse)) => void;
  lastChatAppId: string;
  setLastChatAppId: (id: string) => void;
  lastChatId: string;
  setLastChatId: (id: string) => void;
  delOneHistoryItem: (e: DeleteChatItemProps & { index: number }) => Promise<any>;
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
        histories: [],
        async loadHistories(e) {
          const data = await getChatHistories(e);
          set((state) => {
            state.histories = data;
          });
          return null;
        },
        async delOneHistory(props) {
          set((state) => {
            state.histories = state.histories.filter((item) => item.chatId !== props.chatId);
          });
          await delChatHistoryById(props);
        },
        async clearHistories(data) {
          set((state) => {
            state.histories = [];
          });
          await clearChatHistoryByAppId(data);
        },
        pushHistory(history) {
          set((state) => {
            state.histories = [history, ...state.histories];
          });
        },
        async updateHistory(props) {
          const { chatId, customTitle, top, title, updateTime } = props;
          const index = get().histories.findIndex((item) => item.chatId === chatId);

          if (index > -1) {
            const newHistory = {
              ...get().histories[index],
              ...(title && { title }),
              ...(updateTime && { updateTime }),
              ...(customTitle !== undefined && { customTitle }),
              ...(top !== undefined && { top })
            };

            if (customTitle !== undefined || top !== undefined) {
              try {
                putChatHistory(props);
              } catch (error) {}
            }

            set((state) => {
              const newHistories = (() => {
                return [
                  newHistory,
                  ...get().histories.slice(0, index),
                  ...get().histories.slice(index + 1)
                ];
              })();

              state.histories = newHistories;
            });
          }
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
        async delOneHistoryItem({ index, ...props }) {
          const { chatId, contentId } = props;
          if (!chatId || !contentId) return;

          try {
            get().setChatData((state) => ({
              ...state,
              history: state.history.filter((_, i) => i !== index)
            }));
            await delChatRecordById(props);
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
