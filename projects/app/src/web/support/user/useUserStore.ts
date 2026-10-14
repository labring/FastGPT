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
  isUserInfoInitialized: boolean;
  authGeneration: number;
  invalidateAuthSession: () => void;
  isTeamAdmin: boolean;
  initUserInfo: () => Promise<UserType | null>;
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
        enterpriseAuthNoticeReadTeamIds: [],
        setEnterpriseAuthNoticeRead(teamId: string) {
          if (!teamId) return;

          set((state) => {
            if (state.enterpriseAuthNoticeReadTeamIds.includes(teamId)) return;
            state.enterpriseAuthNoticeReadTeamIds.push(teamId);
          });
        },

        userInfo: null,
        isUserInfoInitialized: false,
        authGeneration: 0,
        /** 立即撤销本地会话；保留跳登录时使用的原成员 ID，避免丢失跨团队跳转校验。 */
        invalidateAuthSession() {
          set((state) => {
            state.authGeneration += 1;
            state.userInfo = null;
            state.isUserInfoInitialized = true;
            state.isTeamAdmin = false;
          });
        },
        isTeamAdmin: false,
        async initUserInfo() {
          get().initTeamPlanStatus();

          try {
            const res = await getTokenLogin();
            get().setUserInfo(res);

            //设置html的fontsize
            const html = document?.querySelector('html');
            if (html) {
              // html.style.fontSize = '16px';
            }

            return res;
          } catch (error) {
            // 网络失败也结束首次身份确认，避免配置初始化永久等待；后续仍可重试登录。
            set((state) => {
              state.isUserInfoInitialized = true;
            });
            console.log('[Init user] error', error);
            return null;
          }
        },
        /** 同步用户和成员身份；普通信息刷新保留配置，身份变化使旧请求失效。 */
        setUserInfo(user: UserType | null) {
          setCurrentAuthTmbId(user?.team?.tmbId);
          set((state) => {
            // 相同身份的信息刷新不启动新会话；登录、退出和团队切换使旧初始化请求失效。
            if (
              state.userInfo?._id !== user?._id ||
              state.userInfo?.team?.tmbId !== user?.team?.tmbId
            ) {
              state.authGeneration += 1;
            }
            state.userInfo = user ? user : null;
            // 与身份、会话代次一起更新，首次恢复用户时只触发一次配置请求。
            state.isUserInfoInitialized = true;
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
          enterpriseAuthNoticeReadTeamIds: state.enterpriseAuthNoticeReadTeamIds
        })
      }
    )
  )
);
