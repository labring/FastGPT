import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { UserUpdateParams } from '@/types/user';
import type { UserType } from '@fastgpt/global/support/user/type.d';
import { formatPrice } from '@fastgpt/global/support/wallet/bill/tools';
import { getTokenLogin, putUserInfo } from '@/web/support/user/api';

type State = {
  lastTmbId: string;
  setLastTmbId: (tmbId?: string) => void;
  userInfo: UserType | null;
  initUserInfo: () => Promise<UserType>;
  setUserInfo: (user: UserType | null) => void;
  updateUserInfo: (user: UserUpdateParams) => Promise<void>;
};

export const useUserStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        lastTmbId: '',
        setLastTmbId(tmbId) {
          if (tmbId) {
            set((state) => {
              state.lastTmbId = tmbId;
            });
          }
        },
        userInfo: null,
        async initUserInfo() {
          const res = await getTokenLogin();
          get().setUserInfo(res);
          get().setLastTmbId(res.team?.tmbId);

          return res;
        },
        setUserInfo(user: UserType | null) {
          get().setLastTmbId(user?.team?.tmbId);
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
        }
      })),
      {
        name: 'userStore',
        partialize: (state) => ({
          lastTmbId: state.lastTmbId
        })
      }
    )
  )
);
