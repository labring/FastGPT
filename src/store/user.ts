import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { UserType, UserUpdateParams } from '@/types/user';
import { getMyModels, getModelById } from '@/api/model';
import { formatPrice } from '@/utils/user';
import { getTokenLogin } from '@/api/user';
import { defaultModel } from '@/constants/model';
import { ModelListItemType } from '@/types/model';
import { KbItemType } from '@/types/plugin';
import { getKbList } from '@/api/plugins/kb';
import { defaultKbDetail } from '@/constants/kb';
import type { ModelSchema } from '@/types/mongoSchema';

type State = {
  userInfo: UserType | null;
  initUserInfo: () => Promise<null>;
  setUserInfo: (user: UserType | null) => void;
  updateUserInfo: (user: UserUpdateParams) => void;
  // model
  lastModelId: string;
  setLastModelId: (id: string) => void;
  myModels: ModelListItemType[];
  myCollectionModels: ModelListItemType[];
  loadMyModels: (init?: boolean) => Promise<null>;
  modelDetail: ModelSchema;
  loadModelDetail: (id: string, init?: boolean) => Promise<ModelSchema>;
  refreshModel: {
    freshMyModels(): void;
    updateModelDetail(model: ModelSchema): void;
    removeModelDetail(modelId: string): void;
  };
  // kb
  lastKbId: string;
  setLastKbId: (id: string) => void;
  myKbList: KbItemType[];
  loadKbList: (init?: boolean) => Promise<KbItemType[]>;
  KbDetail: KbItemType;
  getKbDetail: (id: string) => KbItemType;
};

export const useUserStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        userInfo: null,
        async initUserInfo() {
          const res = await getTokenLogin();
          get().setUserInfo(res);
          return null;
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
        myModels: [],
        myCollectionModels: [],
        async loadMyModels(init = false) {
          if (get().myModels.length > 0 && !init) return null;
          const res = await getMyModels();
          set((state) => {
            state.myModels = res.myModels;
            state.myCollectionModels = res.myCollectionModels;
          });
          return null;
        },
        modelDetail: defaultModel,
        async loadModelDetail(id: string, init = false) {
          if (id === get().modelDetail._id && !init) return get().modelDetail;

          const res = await getModelById(id);
          set((state) => {
            state.modelDetail = res;
          });
          return res;
        },
        refreshModel: {
          freshMyModels() {
            get().loadMyModels(true);
          },
          updateModelDetail(model: ModelSchema) {
            set((state) => {
              state.modelDetail = model;
            });
            get().loadMyModels(true);
          },
          removeModelDetail(modelId: string) {
            if (modelId === get().modelDetail._id) {
              set((state) => {
                state.modelDetail = defaultModel;
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
        KbDetail: defaultKbDetail,
        getKbDetail(id: string) {
          const data = get().myKbList.find((item) => item._id === id) || defaultKbDetail;

          set((state) => {
            state.KbDetail = data;
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
