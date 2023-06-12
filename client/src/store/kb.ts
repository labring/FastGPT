import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { type KbTestItemType } from '@/types/plugin';

type State = {
  kbTestList: KbTestItemType[];
  pushKbTestItem: (data: KbTestItemType) => void;
  delKbTestItemById: (id: string) => void;
  updateKbItemById: (data: KbTestItemType) => void;
};

export const useKbStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        kbTestList: [],
        pushKbTestItem(data) {
          set((state) => {
            state.kbTestList = [data, ...state.kbTestList].slice(0, 500);
          });
        },
        delKbTestItemById(id) {
          set((state) => {
            state.kbTestList = state.kbTestList.filter((item) => item.id !== id);
          });
        },
        updateKbItemById(data: KbTestItemType) {
          set((state) => {
            state.kbTestList = state.kbTestList.map((item) => (item.id === data.id ? data : item));
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
