import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { UserType, UserUpdateParams } from '@/types/user';
import { getMyModels, getModelById } from '@/api/app';
import { formatPrice } from '@/utils/user';
import { getTokenLogin } from '@/api/user';
import { defaultApp } from '@/constants/model';
import { AppListItemType } from '@/types/app';
import { KbItemType } from '@/types/plugin';
import { getKbList, getKbById } from '@/api/plugins/kb';
import { defaultKbDetail } from '@/constants/kb';
import type { AppSchema } from '@/types/mongoSchema';

type State = {
  userInfo: UserType | null;
  initUserInfo: () => Promise<UserType>;
  setUserInfo: (user: UserType | null) => void;
  updateUserInfo: (user: UserUpdateParams) => void;
  // model
  lastModelId: string;
  setLastModelId: (id: string) => void;
  myApps: AppListItemType[];
  myCollectionApps: AppListItemType[];
  loadMyModels: (init?: boolean) => Promise<null>;
  appDetail: AppSchema;
  loadAppDetail: (id: string, init?: boolean) => Promise<AppSchema>;
  refreshModel: {
    freshMyModels(): void;
    updateModelDetail(model: AppSchema): void;
    removeModelDetail(modelId: string): void;
  };
  // kb
  lastKbId: string;
  setLastKbId: (id: string) => void;
  myKbList: KbItemType[];
  loadKbList: (init?: boolean) => Promise<KbItemType[]>;
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
        lastModelId: '',
        setLastModelId(id: string) {
          set((state) => {
            state.lastModelId = id;
          });
        },
        myApps: [],
        myCollectionApps: [],
        async loadMyModels(init = false) {
          if (get().myApps.length > 0 && !init) return null;
          const res = await getMyModels();
          set((state) => {
            state.myApps = res.myApps;
            state.myCollectionApps = res.myCollectionApps;
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
        refreshModel: {
          freshMyModels() {
            get().loadMyModels(true);
          },
          updateModelDetail(model: AppSchema) {
            set((state) => {
              state.appDetail = model;
            });
            get().loadMyModels(true);
          },
          removeModelDetail(modelId: string) {
            if (modelId === get().appDetail._id) {
              set((state) => {
                state.appDetail = defaultApp;
                state.lastModelId = '';
              });
            }
            get().loadMyModels(true);
          }
        },
        lastKbId: '',
        setLastKbId(id: string) {
          set((state) => {
            state.lastKbId = id;
          });
        },
        myKbList: [],
        async loadKbList(init = false) {
          if (get().myKbList.length > 0 && !init) return get().myKbList;
          const res = await getKbList();
          set((state) => {
            state.myKbList = res;
          });
          return res;
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
        partialize: (state) => ({
          lastModelId: state.lastModelId,
          lastKbId: state.lastKbId
        })
      }
    )
  )
);
