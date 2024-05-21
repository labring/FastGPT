import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { getMyApps } from '@/web/core/app/api';
import { AppListItemType } from '@fastgpt/global/core/app/type';

export type State = {
  myApps: AppListItemType[];
  loadMyApps: () => Promise<AppListItemType[]>;
};

export const useAppStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        myApps: [],
        async loadMyApps() {
          const res = await getMyApps();
          set((state) => {
            state.myApps = res;
          });
          return res;
        }
      })),
      {
        name: 'appStore',
        partialize: (state) => ({})
      }
    )
  )
);
