import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { DatasetItemType, DatasetsItemType } from '@/types/core/dataset';
import { getAllDataset, getDatasets, getDatasetById, putDatasetById } from '@/web/core/dataset/api';
import { defaultKbDetail } from '@/constants/dataset';
import type { DatasetUpdateParams } from '@/global/core/api/datasetReq.d';

export type SearchTestStoreItemType = {
  id: string;
  datasetId: string;
  text: string;
  time: Date;
  results: SearchDataResponseItemType[];
};

type State = {
  allDatasets: DatasetsItemType[];
  loadAllDatasets: () => Promise<DatasetsItemType[]>;
  myDatasets: DatasetsItemType[];
  loadDatasets: (parentId?: string) => Promise<any>;
  setDatasets(val: DatasetsItemType[]): void;
  datasetDetail: DatasetItemType;
  loadDatasetDetail: (id: string, init?: boolean) => Promise<DatasetItemType>;
  updateDataset: (data: DatasetUpdateParams) => Promise<any>;

  datasetTestList: SearchTestStoreItemType[];
  pushDatasetTestItem: (data: SearchTestStoreItemType) => void;
  delDatasetTestItemById: (id: string) => void;
  updateDatasetItemById: (data: SearchTestStoreItemType) => void;
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
        datasetDetail: defaultKbDetail,
        async loadDatasetDetail(id: string, init = false) {
          if (!id || (id === get().datasetDetail._id && !init)) return get().datasetDetail;

          const data = await getDatasetById(id);

          set((state) => {
            state.datasetDetail = data;
          });

          return data;
        },
        async updateDataset(data) {
          if (get().datasetDetail._id === data.id) {
            set((state) => {
              state.datasetDetail = {
                ...state.datasetDetail,
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
                    tags: data.tags?.split(' ') || []
                  }
                : item
            );
          });
          await putDatasetById(data);
        },
        datasetTestList: [],
        pushDatasetTestItem(data) {
          set((state) => {
            state.datasetTestList = [data, ...state.datasetTestList].slice(0, 100);
          });
        },
        delDatasetTestItemById(id) {
          set((state) => {
            state.datasetTestList = state.datasetTestList.filter((item) => item.id !== id);
          });
        },
        updateDatasetItemById(data: SearchTestStoreItemType) {
          set((state) => {
            state.datasetTestList = state.datasetTestList.map((item) =>
              item.id === data.id ? data : item
            );
          });
        }
      })),
      {
        name: 'datasetStore',
        partialize: (state) => ({
          datasetTestList: state.datasetTestList
        })
      }
    )
  )
);
