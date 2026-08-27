import { create, devtools, persist, immer } from '@fastgpt/web/common/zustand';
import axios from 'axios';
import type { OAuthEnum } from '@fastgpt/global/support/user/constant';
import type {
  TTSModelType,
  LLMModelItemType,
  RerankModelItemType,
  EmbeddingModelItemType,
  STTModelType
} from '@fastgpt/global/core/ai/model.schema';
import type { GetSystemInitDataResponse } from '@fastgpt/global/openapi/common/system/api';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import type { LicenseDataType } from '@fastgpt/global/common/system/types';
import type { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import type { SystemDefaultModelType } from '@fastgpt/service/core/ai/type';
import {
  formatModelProviders,
  getModelProviderFromCache,
  getModelProviderListFromCache,
  type langType,
  type ModelProviderItemType
} from '@fastgpt/global/core/ai/provider';
import { getMyModels, getOperationalAd } from './api';

type LoginStoreType = {
  provider: OAuthEnum;
  lastRoute: string;
  state: string;
  lastTmbId?: string;
  flow?: 'login' | 'accountCancellation';
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
  feConfigs: FastGPTFeConfigsType;
  subPlans?: SubPlanType;
  systemVersion: string;

  modelProviders: Record<langType, ModelProviderItemType[]>;
  modelProviderMap: Record<langType, Record<string, ModelProviderItemType>>;
  aiproxyChannels: NonNullable<GetSystemInitDataResponse['aiproxyChannels']>;
  defaultModels: SystemDefaultModelType;
  llmModelList: LLMModelItemType[];
  embeddingModelList: EmbeddingModelItemType[];
  ttsModelList: TTSModelType[];
  reRankModelList: RerankModelItemType[];
  sttModelList: STTModelType[];
  myModelList: {
    modelSet: Set<string>;
    versionKey: string;
  };
  operationalAd?: { operationalAdImage: string; operationalAdLink: string; id: string };
  loadOperationalAd: () => Promise<void>;
  getMyModelList: () => Promise<Set<string>>;
  getVlmModelList: () => LLMModelItemType[];
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
            const { getLicenseData } = await import('@/web/common/license/api');
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
        llmModelList: [],
        embeddingModelList: [],
        ttsModelList: [],
        reRankModelList: [],
        sttModelList: [],
        myModelList: {
          modelSet: new Set(),
          versionKey: ''
        },
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
        getMyModelList: async () => {
          try {
            const res = await getMyModels({ versionKey: get().myModelList.versionKey });
            if (res.isRefreshed === false) {
              return new Set(get().myModelList.modelSet);
            } else {
              set((state) => {
                state.myModelList = {
                  modelSet: new Set(res.models),
                  versionKey: res.versionKey
                };
              });
              return new Set(res.models);
            }
          } catch {
            console.log('Get my modals error');
          }
          return new Set(get().myModelList.modelSet);
        },

        getVlmModelList: () => {
          return get().llmModelList.filter((item) => item.vision);
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

            state.llmModelList =
              res.activeModelList?.filter((item) => item.type === ModelTypeEnum.llm) ??
              state.llmModelList;
            state.embeddingModelList =
              res.activeModelList?.filter((item) => item.type === ModelTypeEnum.embedding) ??
              state.embeddingModelList;
            state.ttsModelList =
              res.activeModelList?.filter((item) => item.type === ModelTypeEnum.tts) ??
              state.ttsModelList;
            state.reRankModelList =
              res.activeModelList?.filter((item) => item.type === ModelTypeEnum.rerank) ??
              state.reRankModelList;
            state.sttModelList =
              res.activeModelList?.filter((item) => item.type === ModelTypeEnum.stt) ??
              state.sttModelList;

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
          defaultModels: state.defaultModels,
          llmModelList: state.llmModelList,
          embeddingModelList: state.embeddingModelList,
          ttsModelList: state.ttsModelList,
          reRankModelList: state.reRankModelList,
          sttModelList: state.sttModelList
        })
      }
    )
  )
);
