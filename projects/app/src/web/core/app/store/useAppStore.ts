import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { getMyApps } from '@/web/core/app/api';
import { AppListItemType } from '@fastgpt/global/core/app/type';

export type State = {
  myApps: AppListItemType[];
  loadMyApps: (...arg: Parameters<typeof getMyApps>) => Promise<AppListItemType[]>;
};

export const useAppStore = create<State>()(
  devtools(
    immer((set, get) => ({
      myApps: [],
      async loadMyApps(data) {
        const res = await getMyApps(data);
        set((state) => {
          state.myApps = res;
        });
        return res;
      }
    }))
  )
);
