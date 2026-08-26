import { create, devtools, persist, immer } from '@fastgpt/web/common/zustand';
import axios from 'axios';
import type { OAuthEnum } from '@fastgpt/global/support/user/constant';
import type { GetSystemInitDataResponse } from '@fastgpt/global/openapi/common/system/api';
import { type FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import { type SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import type { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import {
  formatModelProviders,
  getModelProviderFromCache,
  getModelProviderListFromCache,
  type langType,
  type ModelProviderItemType
} from '@fastgpt/global/core/ai/provider';
import { getOperationalAd } from './api';

type LoginStoreType = {
  provider: OAuthEnum;
  lastRoute: string;
  state: string;
  lastTmbId?: string;
  flow?: 'login' | 'accountCancellation';
};
type SystemDefaultModelType = NonNullable<GetSystemInitDataResponse['defaultModels']>;

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

  initDataBufferId?: string;
  feConfigs: FastGPTFeConfigsType;
  subPlans?: SubPlanType;
  systemVersion: string;

  modelProviders: Record<langType, ModelProviderItemType[]>;
  modelProviderMap: Record<langType, Record<string, ModelProviderItemType>>;
  aiproxyChannels: NonNullable<GetSystemInitDataResponse['aiproxyChannels']>;
  defaultModels: SystemDefaultModelType;
  operationalAd?: { operationalAdImage: string; operationalAdLink: string; id: string };
  loadOperationalAd: () => Promise<void>;
  getModelProviders: (language?: string) => ModelProviderItemType[];
  getModelProvider: (provider?: string, language?: string) => ModelProviderItemType;

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
          } catch (error) {}
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

        initDataBufferId: undefined,
        feConfigs: {
          uploadFileMaxSize: 1000,
          uploadFileMaxAmount: 1000
        },
        subPlans: undefined,
        systemVersion: '0.0.0',

        modelProviders: {
          en: [],
          'zh-CN': [],
          'zh-Hant': []
        },
        modelProviderMap: {
          en: {},
          'zh-CN': {},
          'zh-Hant': {}
        },
        aiproxyChannels: [],
        defaultModels: {},
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
        getModelProviders(language = 'en') {
          return getModelProviderListFromCache(get().modelProviders, language);
        },
        getModelProvider(provider, language = 'en') {
          return getModelProviderFromCache({
            cache: get().modelProviderMap,
            provider,
            language
          });
        },
        initStaticData(res) {
          set((state) => {
            state.initDataBufferId = res.bufferId;

            state.feConfigs = res.feConfigs ?? state.feConfigs;
            state.subPlans = res.subPlans ?? state.subPlans;
            state.systemVersion = res.systemVersion ?? state.systemVersion;

            if (res.modelProviders) {
              const { ModelProviderListCache, ModelProviderMapCache } = formatModelProviders(
                res.modelProviders
              );
              state.modelProviders = ModelProviderListCache ?? state.modelProviders;
              state.modelProviderMap = ModelProviderMapCache ?? state.modelProviderMap;
            }
            state.aiproxyChannels = res.aiproxyChannels ?? state.aiproxyChannels;

            state.defaultModels = res.defaultModels ?? state.defaultModels;
          });
        }
      })),
      {
        name: 'globalStore',
        partialize: (state) => ({
          gitStar: state.gitStar,

          loginStore: state.loginStore,
          initDataBufferId: state.initDataBufferId,
          feConfigs: state.feConfigs,
          subPlans: state.subPlans,
          systemVersion: state.systemVersion,

          modelProviders: state.modelProviders,
          modelProviderMap: state.modelProviderMap,
          aiproxyChannels: state.aiproxyChannels,
          defaultModels: state.defaultModels
        })
      }
    )
  )
);
