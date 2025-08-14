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
import { type InitDateResponse } from '@/global/common/api/systemRes';
import { type FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import { type SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import type { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { type SystemDefaultModelType } from '@fastgpt/service/core/ai/type';

type LoginStoreType = { provider: `${OAuthEnum}`; lastRoute: string; state: string };

export type NotSufficientModalType =
  | TeamErrEnum.datasetSizeNotEnough
  | TeamErrEnum.aiPointsNotEnough
  | TeamErrEnum.datasetAmountNotEnough
  | TeamErrEnum.teamMemberOverSize
  | TeamErrEnum.appAmountNotEnough;

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
  defaultModels: SystemDefaultModelType;
  llmModelList: LLMModelItemType[];
  datasetModelList: LLMModelItemType[];
  getVlmModelList: () => LLMModelItemType[];
  embeddingModelList: EmbeddingModelItemType[];
  ttsModelList: TTSModelType[];
  reRankModelList: RerankModelItemType[];
  sttModelList: STTModelType[];
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
        lastRoute: '/dashboard/apps',
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

        gitStar: 25000,
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
        defaultModels: {},
        llmModelList: [],
        datasetModelList: [],
        embeddingModelList: [],
        ttsModelList: [],
        reRankModelList: [],
        sttModelList: [],
        getVlmModelList: () => {
          return get().llmModelList.filter((item) => item.vision);
        },
        initStaticData(res) {
          set((state) => {
            state.initDataBufferId = res.bufferId;

            state.feConfigs = res.feConfigs ?? state.feConfigs;
            state.subPlans = res.subPlans ?? state.subPlans;
            state.systemVersion = res.systemVersion ?? state.systemVersion;

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
          loginStore: state.loginStore,
          initDataBufferId: state.initDataBufferId,
          feConfigs: state.feConfigs,
          subPlans: state.subPlans,
          systemVersion: state.systemVersion,
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
