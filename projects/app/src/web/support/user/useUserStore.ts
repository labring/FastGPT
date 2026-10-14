import { resetUserModelCatalogAfterLogin } from '@/web/core/ai/model/useUserModelStore';
import { create, devtools, persist, immer } from '@fastgpt/web/common/zustand';

import type { UserUpdateParams } from '@/types/user';
import { getTokenLogin, putUserInfo } from '@/web/support/user/api';
import type { OrgType } from '@fastgpt/global/support/user/team/org/type';
import type { UserType } from '@fastgpt/global/support/user/type';
import type { ClientTeamPlanStatusType } from '@fastgpt/global/support/wallet/sub/type';
import { getTeamPlanStatus } from './team/api';
import { setCurrentAuthTmbId } from './currentAuthTmbId';

type State = {
  systemMsgReadId: string;
  setSysMsgReadId: (id: string) => void;
  enterpriseAuthNoticeReadTeamIds: string[];
  setEnterpriseAuthNoticeRead: (teamId: string) => void;

  userInfo: UserType | null;
  authGeneration: number;
  invalidateAuthSession: () => void;
  isTeamAdmin: boolean;
  initUserInfo: () => Promise<UserType | null>;
  setUserInfo: (user: UserType | null, newSession?: boolean) => void;
  updateUserInfo: (user: UserUpdateParams) => Promise<void>;

  teamPlanStatus: ClientTeamPlanStatusType | null;
  initTeamPlanStatus: () => Promise<ClientTeamPlanStatusType | null>;

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
        enterpriseAuthNoticeReadTeamIds: [],
        setEnterpriseAuthNoticeRead(teamId: string) {
          if (!teamId) return;

          set((state) => {
            if (state.enterpriseAuthNoticeReadTeamIds.includes(teamId)) return;
            state.enterpriseAuthNoticeReadTeamIds.push(teamId);
          });
        },

        userInfo: null,
        authGeneration: 0,
        /** 立即撤销本地会话；保留跳登录时使用的原成员 ID，避免丢失跨团队跳转校验。 */
        invalidateAuthSession() {
          set((state) => {
            state.authGeneration += 1;
            state.userInfo = null;
            state.isTeamAdmin = false;
          });
        },
        isTeamAdmin: false,
        /** 恢复用户后再刷新团队套餐；套餐失败不撤销已恢复的身份，完成后调用方可直接读取套餐状态。 */
        async initUserInfo() {
          const user = await getTokenLogin().catch((error) => {
            console.log('[Init user] error', error);
            return null;
          });
          if (!user) {
            set((state) => {
              state.teamPlanStatus = null;
            });
            return null;
          }

          get().setUserInfo(user);
          await get()
            .initTeamPlanStatus()
            .catch((error) => {
              set((state) => {
                state.teamPlanStatus = null;
              });
              console.log('[Init team plan] error', error);
            });
          return user;
        },
        /** 恢复 Cookie 用户和资料不撤销首屏请求；显式新会话才使旧响应失效，登录成功同时清理模型目录及退出保护。 */
        setUserInfo(user: UserType | null, newSession = false) {
          if (newSession && user) resetUserModelCatalogAfterLogin();
          setCurrentAuthTmbId(user?.team?.tmbId);
          set((state) => {
            if (newSession || (state.userInfo && !user)) {
              state.authGeneration += 1;
            }
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
              state.teamPlanStatus = res ?? null;
            });
            return res ?? null;
          });
        },
        teamMemberGroups: [],
        teamOrgs: []
      })),
      {
        name: 'userStore',
        partialize: (state) => ({
          systemMsgReadId: state.systemMsgReadId,
          enterpriseAuthNoticeReadTeamIds: state.enterpriseAuthNoticeReadTeamIds
        })
      }
    )
  )
);
