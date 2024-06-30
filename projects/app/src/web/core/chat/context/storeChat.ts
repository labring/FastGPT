import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { DeleteChatItemProps } from '@/global/core/chat/api';

type State = {
  lastChatAppId: string;
  setLastChatAppId: (id: string) => void;
  lastChatId: string;
  setLastChatId: (id: string) => void;
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
