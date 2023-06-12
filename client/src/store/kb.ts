import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { type KbTestItemType } from '@/types/plugin';

type State = {
  kbTestList: KbTestItemType[];
  pushKbTestItem: (data: KbTestItemType) => void;
};

export const useKbStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        kbTestList: [],
        pushKbTestItem(data) {
          set((state) => {
            state.kbTestList = [data, ...state.kbTestList].slice(0, 400);
          });
        }
      })),
      {
        name: 'kbStore',
        partialize: (state) => ({
          kbTestList: state.kbTestList
        })
      }
    )
  )
);
