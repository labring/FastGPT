import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { UserType, UserUpdateParams } from '@/types/user';
import type { ModelSchema } from '@/types/mongoSchema';
import { setToken } from '@/utils/user';
import { getMyModels } from '@/api/model';
import { formatPrice } from '@/utils/user';

type State = {
  userInfo: UserType | null;
  setUserInfo: (user: UserType, token?: string) => void;
  updateUserInfo: (user: UserUpdateParams) => void;
  myModels: ModelSchema[];
  getMyModels: () => void;
  setMyModels: (data: ModelSchema[]) => void;
};

export const useUserStore = create<State>()(
  devtools(
    immer((set, get) => ({
      userInfo: null,
      setUserInfo(user: UserType, token?: string) {
        set((state) => {
          state.userInfo = {
            ...user,
            balance: formatPrice(user.balance)
          };
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
      setMyModels(data: ModelSchema[]) {
        set((state) => {
          state.myModels = data;
        });
        return null;
      }
    }))
  )
);
