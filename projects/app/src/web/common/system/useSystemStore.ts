import { create, devtools, persist, immer } from '@fastgpt/web/common/zustand';
import axios from 'axios';
import type { OAuthEnum } from '@fastgpt/global/support/user/constant';
import type { GetSystemInitDataResponse } from '@fastgpt/global/openapi/common/system/api';
import type { FastGPTFeConfigsType, LicenseDataType } from '@fastgpt/global/common/system/types';
import type { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import type { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { getOperationalAd } from './api';

type LoginStoreType = {
  provider: OAuthEnum;
  lastRoute: string;
  state: string;
  lastTmbId?: string;
  flow?: 'login' | 'accountCancellation' | 'passwordChange';
  passwordChangeRequired?: boolean;
};

export type NotSufficientModalType =
  | TeamErrEnum.datasetSizeNotEnough
  | TeamErrEnum.aiPointsNotEnough
  | TeamErrEnum.datasetAmountNotEnough
  | TeamErrEnum.teamMemberOverSize
  | TeamErrEnum.appAmountNotEnough
  | TeamErrEnum.ticketNotAvailable;

type State = {
  initd: boolean;
  setInitd: () => void;

  lastRoute: string;
  setLastRoute: (e: string) => void;
  lastAppListRouteType?: string;
  setLastAppListRouteType: (e?: string) => void;

  loginStore?: LoginStoreType;
  setLoginStore: (e?: LoginStoreType) => void;

  loading: boolean;
  setLoading: (val: boolean) => null;
  gitStar: number;
  loadGitStar: () => Promise<void>;

  notSufficientModalType?: NotSufficientModalType;
  setNotSufficientModalType: (val?: NotSufficientModalType) => void;
  showProModal: boolean;
  setShowProModal: (e: boolean) => void;

  // License 激活状态（迁移自 pro/admin，开源版可提示购买商业版）
  licenseData?: LicenseDataType;
  licenseLoading: boolean;
  initLicenseData: () => Promise<void>;
  clearLicenseData: () => void;

  initDataBufferId?: string;
  feConfigs: NonNullable<GetSystemInitDataResponse['feConfigs']> & {
    limit: FastGPTFeConfigsType['limit'];
  };
  subPlans?: SubPlanType;
  systemVersion: string;

  operationalAd?: { operationalAdImage: string; operationalAdLink: string; id: string };
  loadOperationalAd: () => Promise<void>;

  initStaticData: (e: GetSystemInitDataResponse) => void;

  appType?: string;
  setAppType: (e?: string) => void;
};

export const useSystemStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        appType: undefined,
        setAppType(e) {
          set((state) => {
            state.appType = e;
          });
        },
        initd: false,
        setInitd() {
          set((state) => {
            state.initd = true;
          });
        },
        lastRoute: '/dashboard/agent',
        setLastRoute(e) {
          set((state) => {
            state.lastRoute = e;
          });
        },
        lastAppListRouteType: undefined,
        setLastAppListRouteType(e) {
          set((state) => {
            state.lastAppListRouteType = e;
          });
        },
        loginStore: undefined,
        setLoginStore(e) {
          set((state) => {
            state.loginStore = e;
          });
        },
        loading: false,
        setLoading: (val: boolean) => {
          set((state) => {
            state.loading = val;
          });
          return null;
        },

        gitStar: 26500,
        async loadGitStar() {
          if (!get().feConfigs?.show_git) return;
          try {
            const { data: git } = await axios.get('https://api.github.com/repos/labring/FastGPT');

            set((state) => {
              state.gitStar = git.stargazers_count;
            });
            // gitStar 加载失败静默处理（非核心功能，不打断用户）
          } catch {
            // 忽略 git star 加载失败
          }
        },

        notSufficientModalType: undefined,
        setNotSufficientModalType(type) {
          set((state) => {
            state.notSufficientModalType = type;
          });
        },

        showProModal: false,
        setShowProModal(e) {
          set((state) => {
            state.showProModal = e;
          });
        },

        // License 激活状态（迁移自 pro/admin）
        // licenseLoading 初始为 true：未检测前视为加载中，避免已有 license 时刷新闪烁激活弹窗
        licenseData: undefined,
        licenseLoading: true,
        async initLicenseData() {
          set((state) => {
            state.licenseLoading = true;
          });
          try {
            const { getLicenseData } = await import('@/web/admin/license/api');
            const licenseData = await getLicenseData();
            set((state) => {
              state.licenseData = licenseData;
              state.licenseLoading = false;
            });
          } catch (error) {
            set((state) => {
              state.licenseData = undefined;
              state.licenseLoading = false;
            });
            console.error('Init license data failed', error);
          }
        },
        clearLicenseData() {
          set((state) => {
            state.licenseData = undefined;
          });
        },

        initDataBufferId: undefined,
        feConfigs: {
          limit: { uploadFileMaxSize: 1000, uploadFileMaxAmount: 1000 }
        },
        subPlans: undefined,
        systemVersion: '0.0.0',

        operationalAd: undefined,
        loadOperationalAd: async () => {
          try {
            const res = await getOperationalAd();
            set((state) => {
              state.operationalAd = res;
            });
          } catch (error) {
            console.log('Get operational ad error', error);
          }
        },
        /** 整体替换接口返回的配置，避免未登录响应与上次登录配置合并后残留字段。 */
        initStaticData(res) {
          set((state) => {
            state.initDataBufferId = res.bufferId;
            if (res.feConfigs) {
              // 只补客户端既有上传默认值，不合并上一页字段；响应中的 0 也必须保留。
              state.feConfigs = {
                ...res.feConfigs,
                limit: {
                  ...res.feConfigs.limit,
                  uploadFileMaxAmount: res.feConfigs.limit?.uploadFileMaxAmount || 1000,
                  uploadFileMaxSize: res.feConfigs.limit?.uploadFileMaxSize || 1000
                }
              };
            }
            state.subPlans = res.subPlans ?? state.subPlans;
            state.systemVersion = res.systemVersion ?? state.systemVersion;
          });
        }
      })),
      {
        name: 'globalStore',
        version: 4,
        // 清理旧结构与可能透传的私有字段，下一次初始化重新确认配置。
        migrate: (persistedState): Partial<State> => {
          const {
            feConfigs: _feConfigs,
            initDataBufferId: _initDataBufferId,
            aiproxyChannels: _aiproxyChannels,
            modelProviders: _modelProviders,
            modelProviderMap: _modelProviderMap,
            defaultModels: _defaultModels,
            ...systemState
          } = persistedState as Record<string, unknown>;
          return {
            ...systemState,
            feConfigs: { limit: { uploadFileMaxAmount: 1000, uploadFileMaxSize: 1000 } },
            initDataBufferId: undefined
          };
        },
        partialize: (state) => ({
          gitStar: state.gitStar,

          loginStore: state.loginStore,
          initDataBufferId: state.initDataBufferId,
          feConfigs: state.feConfigs,
          subPlans: state.subPlans,
          systemVersion: state.systemVersion
        })
      }
    )
  )
);
