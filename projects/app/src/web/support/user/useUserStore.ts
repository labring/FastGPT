import type { UserUpdateParams } from '@/types/user';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getTokenLogin, putUserInfo } from '@/web/support/user/api';
import { getTeamMembers } from '@/web/support/user/team/api';
import type { MemberGroupListType } from '@fastgpt/global/support/permission/memberGroup/type';
import type { OrgMemberSchemaType, OrgType } from '@fastgpt/global/support/user/team/org/type';
import type { TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import type { UserType } from '@fastgpt/global/support/user/type.d';
import type { FeTeamPlanStatusType } from '@fastgpt/global/support/wallet/sub/type';
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { getTeamPlanStatus } from './team/api';
import { getGroupList } from './team/group/api';
import { getOrgList } from './team/org/api';

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

  teamPlanStatus: FeTeamPlanStatusType | null;
  initTeamPlanStatus: () => Promise<any>;

  teamMemberGroups: MemberGroupListType;
  myGroups: MemberGroupListType;
  loadAndGetGroups: (init?: boolean) => Promise<MemberGroupListType>;

  teamOrgs: OrgType[];
  myOrgs: OrgType[];
  loadAndGetOrgs: (init?: boolean) => Promise<OrgType[]>;
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
        teamOrgs: [],
        myGroups: [],
        loadAndGetGroups: async (init = false) => {
          if (!useSystemStore.getState()?.feConfigs?.isPlus) return [];

          const randomRefresh = Math.random() > 0.7;
          if (!randomRefresh && !init && get().teamMemberGroups.length)
            return Promise.resolve(get().teamMemberGroups);

          const res = await getGroupList();
          set((state) => {
            state.teamMemberGroups = res;
            state.myGroups = res.filter((item) =>
              item.members.map((i) => String(i.tmbId)).includes(String(state.userInfo?.team?.tmbId))
            );
          });

          return res;
        },
        myOrgs: [],
        loadAndGetOrgs: async (init = false) => {
          if (!useSystemStore.getState()?.feConfigs?.isPlus) return [];

          const randomRefresh = Math.random() > 0.7;
          if (!randomRefresh && !init && get().myOrgs.length) return Promise.resolve(get().myOrgs);

          const res = await getOrgList();
          set((state) => {
            state.teamOrgs = res;
            state.myOrgs = res.filter((item) =>
              item.members.map((i) => String(i.tmbId)).includes(String(state.userInfo?.team?.tmbId))
            );
          });

          return res;
        }
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
