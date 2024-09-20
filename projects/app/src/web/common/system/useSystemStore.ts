import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import axios from 'axios';
import { OAuthEnum } from '@fastgpt/global/support/user/constant';
import type {
  AudioSpeechModelType,
  LLMModelItemType,
  ReRankModelItemType,
  VectorModelItemType,
  WhisperModelType
} from '@fastgpt/global/core/ai/model.d';
import { InitDateResponse } from '@/global/common/api/systemRes';
import { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';

type LoginStoreType = { provider: `${OAuthEnum}`; lastRoute: string; state: string };

type State = {
  initd: boolean;
  setInitd: () => void;

  lastRoute: string;
  setLastRoute: (e: string) => void;
  lastAppListRouteType?: string;
  setLastAppListRouteType: (e?: string) => void;

  loginStore?: LoginStoreType;
  setLoginStore: (e: LoginStoreType) => void;
  loading: boolean;
  setLoading: (val: boolean) => null;
  gitStar: number;
  loadGitStar: () => Promise<void>;

  isNotSufficientModal: boolean;
  setIsNotSufficientModal: (val: boolean) => void;

  feConfigs: FastGPTFeConfigsType;
  subPlans?: SubPlanType;
  systemVersion: string;
  llmModelList: LLMModelItemType[];
  datasetModelList: LLMModelItemType[];
  vectorModelList: VectorModelItemType[];
  audioSpeechModelList: AudioSpeechModelType[];
  reRankModelList: ReRankModelItemType[];
  whisperModel?: WhisperModelType;
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
        lastRoute: '/app/list',
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

        gitStar: 15600,
        async loadGitStar() {
          if (!get().feConfigs?.show_git) return;
          try {
            const { data: git } = await axios.get('https://api.github.com/repos/labring/FastGPT');

            set((state) => {
              state.gitStar = git.stargazers_count;
            });
          } catch (error) {}
        },

        isNotSufficientModal: false,
        setIsNotSufficientModal(val: boolean) {
          set((state) => {
            state.isNotSufficientModal = val;
          });
        },

        feConfigs: {},
        subPlans: undefined,
        systemVersion: '0.0.0',
        llmModelList: [],
        datasetModelList: [],
        vectorModelList: [],
        audioSpeechModelList: [],
        reRankModelList: [],
        whisperModel: undefined,
        initStaticData(res) {
          set((state) => {
            state.feConfigs = res.feConfigs || {};
            state.subPlans = res.subPlans;
            state.systemVersion = res.systemVersion;

            state.llmModelList = res.llmModels ?? state.llmModelList;
            state.datasetModelList = state.llmModelList.filter((item) => item.datasetProcess);
            state.vectorModelList = res.vectorModels ?? state.vectorModelList;
            state.audioSpeechModelList = res.audioSpeechModels ?? state.audioSpeechModelList;
            state.reRankModelList = res.reRankModels ?? state.reRankModelList;
            state.whisperModel = res.whisperModel;
          });
        }
      })),
      {
        name: 'globalStore',
        partialize: (state) => ({
          loginStore: state.loginStore
        })
      }
    )
  )
);
