import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

type State = {
  localUId: string;
  setLocalUId: (id: string) => void;
};

export const useShareChatStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        localUId: '',
        setLocalUId(id) {
          set((state) => {
            state.localUId = id;
          });
        }
      })),
      {
        name: 'shareChatStore'
      }
    )
  )
);
