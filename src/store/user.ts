import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { UserType, UserUpdateParams } from '@/types/user';
import { setToken } from '@/utils/user';

type State = {
  userInfo: UserType | null;
  setUserInfo: (user: UserType, token?: string) => void;
  updateUserInfo: (user: UserUpdateParams) => void;
};

export const useUserStore = create<State>()(
  devtools(
    immer((set, get) => ({
      userInfo: null,
      setUserInfo: (user: UserType, token?: string) => {
        set((state) => {
          state.userInfo = user;
        });
        token && setToken(token);
      },
      updateUserInfo: (user: UserUpdateParams) => {
        set((state) => {
          if (!state.userInfo) return;
          state.userInfo = {
            ...state.userInfo,
            ...user
          };
        });
      }
    }))
  )
);
