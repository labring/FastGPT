import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet(
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWSYZ1234567890_',
  24
);

type State = {
  localUId: string;
  loaded: boolean;
};

export const useShareChatStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        localUId: `shareChat-${Date.now()}-${nanoid()}`,
        loaded: false
      })),
      {
        name: 'shareChatStore',
        onRehydrateStorage: () => (state) => {
          if (state) {
            state.loaded = true;
          }
        },
        partialize: (state) => ({
          localUId: state.localUId
        })
      }
    )
  )
);
