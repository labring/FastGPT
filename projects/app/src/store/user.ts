import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { UserType, UserUpdateParams } from '@/types/user';
import { getMyModels, getModelById, putAppById } from '@/api/app';
import { formatPrice } from '@fastgpt/common/bill/index';
import { getTokenLogin, putUserInfo } from '@/api/user';
import { defaultApp } from '@/constants/model';
import { AppListItemType, AppUpdateParams } from '@/types/app';

import type { AppSchema } from '@/types/mongoSchema';

type State = {
  userInfo: UserType | null;
  initUserInfo: () => Promise<UserType>;
  setUserInfo: (user: UserType | null) => void;
  updateUserInfo: (user: UserUpdateParams) => Promise<void>;
  myApps: AppListItemType[];
  myCollectionApps: AppListItemType[];
  loadMyApps: (init?: boolean) => Promise<AppListItemType[]>;
  appDetail: AppSchema;
  loadAppDetail: (id: string, init?: boolean) => Promise<AppSchema>;
  updateAppDetail(appId: string, data: AppUpdateParams): Promise<void>;
  clearAppModules(): void;
};

export const useUserStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        userInfo: null,
        async initUserInfo() {
          const res = await getTokenLogin();
          get().setUserInfo(res);
          return res;
        },
        setUserInfo(user: UserType | null) {
          set((state) => {
            state.userInfo = user
              ? {
                  ...user,
                  balance: formatPrice(user.balance)
                }
              : null;
          });
        },
        async updateUserInfo(user: UserUpdateParams) {
          const oldInfo = (get().userInfo ? { ...get().userInfo } : null) as UserType | null;
          set((state) => {
            if (!state.userInfo) return;
            state.userInfo = {
              ...state.userInfo,
              ...user
            };
          });
          try {
            await putUserInfo(user);
          } catch (error) {
            set((state) => {
              state.userInfo = oldInfo;
            });
            return Promise.reject(error);
          }
        },
        myApps: [],
        myCollectionApps: [],
        async loadMyApps(init = true) {
          if (get().myApps.length > 0 && !init) return [];
          const res = await getMyModels();
          set((state) => {
            state.myApps = res;
          });
          return res;
        },
        appDetail: defaultApp,
        async loadAppDetail(id: string, init = false) {
          if (id === get().appDetail._id && !init) return get().appDetail;

          const res = await getModelById(id);
          set((state) => {
            state.appDetail = res;
          });
          return res;
        },
        async updateAppDetail(appId: string, data: AppUpdateParams) {
          await putAppById(appId, data);
          set((state) => {
            state.appDetail = {
              ...state.appDetail,
              ...data
            };
          });
        },
        clearAppModules() {
          set((state) => {
            state.appDetail = {
              ...state.appDetail,
              modules: []
            };
          });
        }
      })),
      {
        name: 'userStore',
        partialize: (state) => ({})
      }
    )
  )
);
