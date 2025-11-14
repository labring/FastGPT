import { create, devtools, persist, immer } from '@fastgpt/web/common/zustand';

import type { UserUpdateParams } from '@/types/user';
import { getTokenLogin, putUserInfo } from '@/web/support/user/api';
import type { OrgType } from '@fastgpt/global/support/user/team/org/type';
import type { UserType } from '@fastgpt/global/support/user/type.d';
import type { ClientTeamPlanStatusType } from '@fastgpt/global/support/wallet/sub/type';
import { getTeamPlanStatus } from './team/api';

type State = {
  systemMsgReadId: string;
  setSysMsgReadId: (id: string) => void;

  isUpdateNotification: boolean;
  setIsUpdateNotification: (val: boolean) => void;

  userInfo: UserType | null;
  isTeamAdmin: boolean;
  initUserInfo: () => Promise<UserType>;
  setUserInfo: (user: UserType | null) => void;
  updateUserInfo: (user: UserUpdateParams) => Promise<void>;

  teamPlanStatus: ClientTeamPlanStatusType | null;
  initTeamPlanStatus: () => Promise<any>;

  teamOrgs: OrgType[];
};

export const useUserStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        systemMsgReadId: '',
        setSysMsgReadId(id: string) {
          set((state) => {
            state.systemMsgReadId = id;
          });
        },

        isUpdateNotification: true,
        setIsUpdateNotification(val: boolean) {
          set((state) => {
            state.isUpdateNotification = val;
          });
        },

        userInfo: null,
        isTeamAdmin: false,
        async initUserInfo() {
          get().initTeamPlanStatus();

          const res = await getTokenLogin();
          get().setUserInfo(res);

          //设置html的fontsize
          const html = document?.querySelector('html');
          if (html) {
            // html.style.fontSize = '16px';
          }

          return res;
        },
        setUserInfo(user: UserType | null) {
          set((state) => {
            state.userInfo = user ? user : null;
            state.isTeamAdmin = !!user?.team?.permission?.hasManagePer;
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
        // team
        teamPlanStatus: null,
        async initTeamPlanStatus() {
          return getTeamPlanStatus().then((res) => {
            set((state) => {
              state.teamPlanStatus = res;
            });
            return res;
          });
        },
        teamMemberGroups: [],
        teamOrgs: []
      })),
      {
        name: 'userStore',
        partialize: (state) => ({
          systemMsgReadId: state.systemMsgReadId,
          isUpdateNotification: state.isUpdateNotification
        })
      }
    )
  )
);
