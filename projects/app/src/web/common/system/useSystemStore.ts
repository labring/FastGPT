import { create, devtools, persist, immer } from '@fastgpt/web/common/zustand';
import type { OAuthEnum } from '@fastgpt/global/support/user/constant';
import type {
  TTSModelType,
  LLMModelItemType,
  RerankModelItemType,
  EmbeddingModelItemType,
  STTModelType
} from '@fastgpt/global/core/ai/model.schema';
import type { InitDateResponse } from '@/pages/api/common/system/getInitData';
import { type FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import { type SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import type { SystemDefaultModelType, SystemModelItemType } from '@fastgpt/service/core/ai/type';
import {
  defaultProvider,
  formatModelProviders,
  type langType,
  type ModelProviderItemType
} from '@fastgpt/global/core/ai/provider';
import { getOperationalAd } from './api';

type ModelWithPermission<T> = T & {
  permission: NonNullable<InitDateResponse['activeModelList']>[number]['permission'];
};

type LoginStoreType = { provider: OAuthEnum; lastRoute: string; state: string };

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

  notSufficientModalType?: NotSufficientModalType;
  setNotSufficientModalType: (val?: NotSufficientModalType) => void;

  initDataBufferId?: string;
  feConfigs: FastGPTFeConfigsType;
  subPlans?: SubPlanType;
  systemVersion: string;

  modelProviders: Record<langType, ModelProviderItemType[]>;
  modelProviderMap: Record<langType, Record<string, ModelProviderItemType>>;
  aiproxyChannels: NonNullable<InitDateResponse['aiproxyChannels']>;
  defaultModels: SystemDefaultModelType;
  systemModelList: SystemModelItemType[];
  llmModelList: ModelWithPermission<LLMModelItemType>[];
  embeddingModelList: ModelWithPermission<EmbeddingModelItemType>[];
  ttsModelList: ModelWithPermission<TTSModelType>[];
  reRankModelList: ModelWithPermission<RerankModelItemType>[];
  sttModelList: ModelWithPermission<STTModelType>[];
  datasetModelList: ModelWithPermission<LLMModelItemType>[];
  operationalAd?: { operationalAdImage: string; operationalAdLink: string; id: string };
  loadOperationalAd: () => Promise<void>;
  getMyModelList: () => Promise<Set<string>>;
  getVlmModelList: () => LLMModelItemType[];
  getDatasetModelList: () => LLMModelItemType[];
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

        notSufficientModalType: undefined,
        setNotSufficientModalType(type) {
          set((state) => {
            state.notSufficientModalType = type;
          });
        },

        initDataBufferId: undefined,
        feConfigs: {
          uploadFileMaxSize: 200,
          uploadFileMaxAmount: 20
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
        systemModelList: [],
        llmModelList: [],
        embeddingModelList: [],
        ttsModelList: [],
        reRankModelList: [],
        sttModelList: [],
        datasetModelList: [],
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
          const models = [
            ...get().llmModelList,
            ...get().embeddingModelList,
            ...get().ttsModelList,
            ...get().sttModelList,
            ...get().reRankModelList
          ];

          return new Set(
            models
              .filter((model) => model.permission?.hasReadPer !== false)
              .map((model) => model.id)
          );
        },

        getVlmModelList: () => {
          return get().llmModelList.filter((item) => item.vision);
        },
        getDatasetModelList: () => {
          return get().llmModelList;
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
            state.systemModelList = res.systemModelList ?? state.systemModelList;
          });
        }
      })),
      {
        name: 'globalStore',
        version: 1,
        migrate: (persistedState: any, _version: number) => {
          // v0→v1: remove model lists and initDataBufferId from old persisted data
          const {
            llmModelList,
            embeddingModelList,
            ttsModelList,
            reRankModelList,
            sttModelList,
            initDataBufferId,
            ...rest
          } = persistedState as Record<string, unknown>;
          return rest;
        },
        partialize: (state) => ({
          loginStore: state.loginStore,
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
