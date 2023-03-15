import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { UserType, UserUpdateParams } from '@/types/user';
import type { ModelType } from '@/types/model';
import { setToken } from '@/utils/user';
import { getMyModels } from '@/api/model';

type State = {
  userInfo: UserType | null;
  setUserInfo: (user: UserType, token?: string) => void;
  updateUserInfo: (user: UserUpdateParams) => void;
  myModels: ModelType[];
  getMyModels: () => void;
  setMyModels: (data: ModelType[]) => void;
};

export const useUserStore = create<State>()(
  devtools(
    immer((set, get) => ({
      userInfo: null,
      setUserInfo(user: UserType, token?: string) {
        set((state) => {
          state.userInfo = user;
        });
        token && setToken(token);
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
      myModels: [],
      getMyModels: () =>
        getMyModels().then((res) => {
          set((state) => {
            state.myModels = res;
          });
          return res;
        }),
      setMyModels(data: ModelType[]) {
        set((state) => {
          state.myModels = data;
        });
        return null;
      }
    }))
  )
);
