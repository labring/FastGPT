import { create, devtools, persist, immer } from '@fastgpt/web/common/zustand';
import type { PluginDatasetType } from '@/pages/api/common/system/getInitData';
import { DatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';

type State = {
  pluginDatasets: PluginDatasetType[];
  pluginDatasetsVersionKey?: string;
  setPluginDatasets: (data: PluginDatasetType[], versionKey?: string) => void;
  updatePluginDatasetStatus: (data: { sourceId: string; status: number }) => void;
  getDatasetTypeConfig: (
    type: string,
    t: (key: string) => string,
    language?: string
  ) =>
    | {
        icon: string;
        avatar: string;
        label: string;
        collectionLabel: string;
        courseUrl?: string;
      }
    | undefined;
};

export const usePluginStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        pluginDatasets: [],
        pluginDatasetsVersionKey: undefined,
        setPluginDatasets(data, versionKey) {
          set((state) => {
            state.pluginDatasets = data;
            if (versionKey) {
              state.pluginDatasetsVersionKey = versionKey;
            }
          });
        },
        updatePluginDatasetStatus({ sourceId, status }) {
          set((state) => {
            const item = state.pluginDatasets.find((d) => d.sourceId === sourceId);
            if (item) item.status = status;
          });
        },
        getDatasetTypeConfig(type, t, language = 'zh-CN') {
          // 优先从 pluginDatasets 匹配
          const pluginDataset = get().pluginDatasets.find((d) => d.sourceId === type);
          if (pluginDataset) {
            return {
              icon: pluginDataset.iconOutline || pluginDataset.icon,
              avatar: pluginDataset.icon,
              label: parseI18nString(pluginDataset.name, language),
              collectionLabel: language === 'en' ? 'File' : '文件',
              courseUrl: pluginDataset.courseUrl
            };
          }

          // 否则从内置 DatasetTypeMap 获取
          const builtinConfig = DatasetTypeMap[type as keyof typeof DatasetTypeMap];
          if (builtinConfig) {
            return {
              icon: builtinConfig.icon,
              avatar: builtinConfig.avatar,
              label: t(builtinConfig.label as any),
              collectionLabel: t(builtinConfig.collectionLabel as any),
              courseUrl: builtinConfig.courseUrl
            };
          }

          return undefined;
        }
      })),
      {
        name: 'pluginStore',
        partialize: (state) => ({
          pluginDatasets: state.pluginDatasets,
          pluginDatasetsVersionKey: state.pluginDatasetsVersionKey
        })
      }
    )
  )
);
