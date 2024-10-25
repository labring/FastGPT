import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { UserUpdateParams } from '@/types/user';
import type { UserType } from '@fastgpt/global/support/user/type.d';
import { getTokenLogin, putUserInfo } from '@/web/support/user/api';
import { FeTeamPlanStatusType } from '@fastgpt/global/support/wallet/sub/type';
import { getTeamPlanStatus } from './team/api';
import { getTeamMembers } from '@/web/support/user/team/api';
import { TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { MemberGroupListType } from '@fastgpt/global/support/permission/memberGroup/type';
import { getGroupList } from './team/group/api';

type State = {
  systemMsgReadId: string;
  setSysMsgReadId: (id: string) => void;

  userInfo: UserType | null;
  initUserInfo: () => Promise<UserType>;
  setUserInfo: (user: UserType | null) => void;
  updateUserInfo: (user: UserUpdateParams) => Promise<void>;

  teamPlanStatus: FeTeamPlanStatusType | null;
  initTeamPlanStatus: () => Promise<any>;

  teamMembers: TeamMemberItemType[];
  loadAndGetTeamMembers: (init?: boolean) => Promise<TeamMemberItemType[]>;

  teamMemberGroups: MemberGroupListType;
  myGroups: MemberGroupListType;
  loadAndGetGroups: (init?: boolean) => Promise<MemberGroupListType>;
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

        userInfo: null,
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
        initTeamPlanStatus() {
          return getTeamPlanStatus().then((res) => {
            set((state) => {
              state.teamPlanStatus = res;
            });
            return res;
          });
        },
        teamMembers: [],
        loadAndGetTeamMembers: async (init = false) => {
          if (!useSystemStore.getState()?.feConfigs?.isPlus) return [];

          const randomRefresh = Math.random() > 0.7;
          if (!randomRefresh && !init && get().teamMembers?.length)
            return Promise.resolve(get().teamMembers);

          const res = await getTeamMembers();
          set((state) => {
            state.teamMembers = res;
          });

          return res;
        },
        teamMemberGroups: [],
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
        }
      })),
      {
        name: 'userStore',
        partialize: (state) => ({
          systemMsgReadId: state.systemMsgReadId
        })
      }
    )
  )
);
