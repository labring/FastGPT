import { create, devtools, persist, immer } from '@fastgpt/web/common/zustand';
import axios from 'axios';
import type { OAuthEnum } from '@fastgpt/global/support/user/constant';
import type {
  TTSModelType,
  LLMModelItemType,
  RerankModelItemType,
  EmbeddingModelItemType,
  STTModelType
} from '@fastgpt/global/core/ai/model.d';
import type { InitDateResponse } from '@/pages/api/common/system/getInitData';
import { type FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import { type SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import type { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import type { SystemDefaultModelType } from '@fastgpt/service/core/ai/type';
import {
  defaultProvider,
  formatModelProviders,
  type langType,
  type ModelProviderItemType
} from '@fastgpt/global/core/ai/provider';
import { getMyModels, getOperationalAd } from './api';

type LoginStoreType = { provider: `${OAuthEnum}`; lastRoute: string; state: string };

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

  initDataBufferId?: string;
  feConfigs: FastGPTFeConfigsType;
  subPlans?: SubPlanType;
  systemVersion: string;

  modelProviders: Record<langType, ModelProviderItemType[]>;
  modelProviderMap: Record<langType, Record<string, ModelProviderItemType>>;
  aiproxyIdMap: NonNullable<InitDateResponse['aiproxyIdMap']>;
  defaultModels: SystemDefaultModelType;
  llmModelList: LLMModelItemType[];
  datasetModelList: LLMModelItemType[];
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

  initStaticData: (e: InitDateResponse) => void;

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

        initDataBufferId: undefined,
        feConfigs: {},
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
        aiproxyIdMap: {},
        defaultModels: {},
        llmModelList: [],
        datasetModelList: [],
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
          return get().modelProviders[language as langType] ?? [];
        },
        getModelProvider(provider, language = 'en') {
          if (!provider) {
            return defaultProvider;
          }
          return get().modelProviderMap[language as langType][provider] ?? {};
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
            state.aiproxyIdMap = res.aiproxyIdMap ?? state.aiproxyIdMap;

            state.llmModelList =
              res.activeModelList?.filter((item) => item.type === ModelTypeEnum.llm) ??
              state.llmModelList;
            state.datasetModelList = state.llmModelList.filter((item) => item.datasetProcess);
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
          aiproxyIdMap: state.aiproxyIdMap,
          defaultModels: state.defaultModels,
          llmModelList: state.llmModelList,
          datasetModelList: state.datasetModelList,
          embeddingModelList: state.embeddingModelList,
          ttsModelList: state.ttsModelList,
          reRankModelList: state.reRankModelList,
          sttModelList: state.sttModelList
        })
      }
    )
  )
);
