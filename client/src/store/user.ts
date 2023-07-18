import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { UserType, UserUpdateParams } from '@/types/user';
import { getMyModels, getModelById } from '@/api/app';
import { formatPrice } from '@/utils/user';
import { getTokenLogin } from '@/api/user';
import { defaultApp } from '@/constants/model';
import { AppListItemType } from '@/types/app';
import type { KbItemType, KbListItemType } from '@/types/plugin';
import { getKbList, getKbById } from '@/api/plugins/kb';
import { defaultKbDetail } from '@/constants/kb';
import type { AppSchema } from '@/types/mongoSchema';

type State = {
  userInfo: UserType | null;
  initUserInfo: () => Promise<UserType>;
  setUserInfo: (user: UserType | null) => void;
  updateUserInfo: (user: UserUpdateParams) => void;
  myApps: AppListItemType[];
  myCollectionApps: AppListItemType[];
  loadMyModels: () => Promise<null>;
  appDetail: AppSchema;
  loadAppDetail: (id: string, init?: boolean) => Promise<AppSchema>;
  clearAppModules(): void;
  // kb
  myKbList: KbListItemType[];
  loadKbList: () => Promise<any>;
  setKbList(val: KbListItemType[]): void;
  kbDetail: KbItemType;
  getKbDetail: (id: string, init?: boolean) => Promise<KbItemType>;
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
        updateUserInfo(user: UserUpdateParams) {
          set((state) => {
            if (!state.userInfo) return;
            state.userInfo = {
              ...state.userInfo,
              ...user
            };
          });
        },
        myApps: [],
        myCollectionApps: [],
        async loadMyModels() {
          const res = await getMyModels();
          set((state) => {
            state.myApps = res;
          });
          return null;
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
        clearAppModules() {
          set((state) => {
            state.appDetail = {
              ...state.appDetail,
              modules: []
            };
          });
        },
        myKbList: [],
        async loadKbList() {
          const res = await getKbList();
          set((state) => {
            state.myKbList = res;
          });
          return res;
        },
        setKbList(val: KbListItemType[]) {
          set((state) => {
            state.myKbList = val;
          });
        },
        kbDetail: defaultKbDetail,
        async getKbDetail(id: string, init = false) {
          if (id === get().kbDetail._id && !init) return get().kbDetail;

          const data = await getKbById(id);

          set((state) => {
            state.kbDetail = data;
          });

          return data;
        }
      })),
      {
        name: 'userStore',
        partialize: (state) => ({})
      }
    )
  )
);
