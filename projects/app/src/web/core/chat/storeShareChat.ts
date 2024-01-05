import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { ChatHistoryItemType } from '@fastgpt/global/core/chat/type.d';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWSYZ1234567890_',
  24
);

type State = {
  localUId: string;
  shareChatHistory: (ChatHistoryItemType & { delete?: boolean })[];
  clearLocalHistory: (shareId?: string) => void;
};

export const useShareChatStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        localUId: `shareChat-${Date.now()}-${nanoid()}`,
        shareChatHistory: [], // old version field
        clearLocalHistory() {
          // abandon
          set((state) => {
            state.shareChatHistory = state.shareChatHistory.map((item) => ({
              ...item,
              delete: true
            }));
          });
        }
      })),
      {
        name: 'shareChatStore',
        partialize: (state) => ({
          localUId: state.localUId,
          shareChatHistory: state.shareChatHistory
        })
      }
    )
  )
);
