import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { DatasetItemType, DatasetListItemType } from '@fastgpt/global/core/dataset/type.d';
import { getAllDataset, getDatasets, getDatasetById, putDatasetById } from '@/web/core/dataset/api';
import { defaultDatasetDetail } from '@/constants/dataset';
import type { DatasetUpdateBody } from '@fastgpt/global/core/dataset/api.d';

type State = {
  allDatasets: DatasetListItemType[];
  loadAllDatasets: () => Promise<DatasetListItemType[]>;
  myDatasets: DatasetListItemType[];
  loadDatasets: (parentId?: string) => Promise<any>;
  setDatasets(val: DatasetListItemType[]): void;
  datasetDetail: DatasetItemType;
  loadDatasetDetail: (id: string, init?: boolean) => Promise<DatasetItemType>;
  updateDataset: (data: DatasetUpdateBody) => Promise<any>;
};

export const useDatasetStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        allDatasets: [],
        async loadAllDatasets() {
          const res = await getAllDataset();
          set((state) => {
            state.allDatasets = res;
          });
          return res;
        },
        myDatasets: [],
        async loadDatasets(parentId = '') {
          const res = await getDatasets({ parentId });
          set((state) => {
            state.myDatasets = res;
          });
          return res;
        },
        setDatasets(val) {
          set((state) => {
            state.myDatasets = val;
          });
        },
        datasetDetail: defaultDatasetDetail,
        async loadDatasetDetail(id: string, init = false) {
          if (!id || (id === get().datasetDetail._id && !init)) return get().datasetDetail;

          const data = await getDatasetById(id);

          set((state) => {
            state.datasetDetail = data;
          });

          return data;
        },
        async updateDataset(data) {
          await putDatasetById(data);

          if (get().datasetDetail._id === data.id) {
            set((state) => {
              state.datasetDetail = {
                ...get().datasetDetail,
                ...data
              };
            });
          }
          set((state) => {
            state.myDatasets = state.myDatasets = state.myDatasets.map((item) =>
              item._id === data.id
                ? {
                    ...item,
                    ...data,
                    tags: data.tags || []
                  }
                : item
            );
          });
        }
      })),
      {
        name: 'datasetStore',
        partialize: (state) => ({})
      }
    )
  )
);
