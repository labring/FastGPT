import { create, devtools, persist, immer } from '@fastgpt/web/common/zustand';
import { GateSchemaType } from '@fastgpt/global/support/user/team/gate/type';
import {
  getTeamGateConfig,
  updateTeamGateConfig,
  getTeamGateConfigCopyRight,
  updateTeamGateConfigCopyRight
} from './api';
import type { putUpdateGateConfigCopyRightData } from '@fastgpt/global/support/user/team/gate/api.d';
import { getMyAppsGate } from '@/web/core/app/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

type State = {
  gateConfig?: GateSchemaType;
  copyRightConfig?: any;

  // init methods
  initGateConfig: () => Promise<void>;
  initCopyRightConfig: () => Promise<void>;

  // clear methods
  clearGateConfig: () => void;
  clearCopyRightConfig: () => void;

  // local update methods
  updateLocalGateConfig: (data: Partial<GateSchemaType>) => void;
  updateLocalCopyRightConfig: (data: Partial<putUpdateGateConfigCopyRightData>) => void;

  // save methods (API calls)
  saveGateConfig: () => Promise<void>;
  saveCopyRightConfig: () => Promise<void>;
};

export const useGateStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        gateConfig: undefined,
        copyRightConfig: undefined,

        clearGateConfig: () => {
          set((state) => {
            state.gateConfig = undefined;
          });
        },
        clearCopyRightConfig: () => {
          set((state) => {
            state.copyRightConfig = undefined;
          });
        },

        initGateConfig: async () => {
          try {
            const gateConfig = await getTeamGateConfig();
            // 获取应用列表，查找 gate 应用
            const apps = await getMyAppsGate();
            const gateApp = apps.find((app) => app.type === AppTypeEnum.gate);

            // 如果找到 gate 应用，并且有 intro 字段，则使用它作为 slogan
            if (gateApp && gateApp.intro) {
              gateConfig.slogan = gateApp.intro;
            }
            set((state) => {
              state.gateConfig = gateConfig;
            });
          } catch (error) {
            set((state) => {
              state.gateConfig = undefined;
            });
            console.error(error);
          }
        },

        initCopyRightConfig: async () => {
          try {
            const copyRightConfig = await getTeamGateConfigCopyRight();
            set((state) => {
              state.copyRightConfig = copyRightConfig;
            });
          } catch (error) {
            set((state) => {
              state.copyRightConfig = undefined;
            });
            console.error(error);
          }
        },

        // 本地更新方法
        updateLocalGateConfig: (data: Partial<GateSchemaType>) => {
          set((state) => {
            if (!state.gateConfig) return;
            state.gateConfig = {
              ...state.gateConfig,
              ...data
            };
          });
        },

        updateLocalCopyRightConfig: (data: Partial<putUpdateGateConfigCopyRightData>) => {
          set((state) => {
            if (!state.copyRightConfig) return;
            state.copyRightConfig = {
              ...state.copyRightConfig,
              ...data
            };
          });
        },

        // 保存方法
        saveGateConfig: async () => {
          const { gateConfig } = get();
          if (!gateConfig) return;

          await updateTeamGateConfig({
            tools: gateConfig.tools,
            placeholderText: gateConfig.placeholderText,
            status: gateConfig.status
          });
        },

        saveCopyRightConfig: async () => {
          const { copyRightConfig } = get();
          if (!copyRightConfig) return;

          await updateTeamGateConfigCopyRight({
            name: copyRightConfig.name
          });
        }
      })),
      {
        name: 'gateStore',
        partialize: (state) => ({
          gateConfig: state.gateConfig,
          copyRightConfig: state.copyRightConfig
        })
      }
    )
  )
);
