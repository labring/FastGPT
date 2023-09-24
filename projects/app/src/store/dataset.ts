import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { SearchTestItemType } from '@/types/core/dataset';
import type { DatasetItemType, DatasetsItemType } from '@/types/core/dataset';
import { getAllDataset, getDatasets, getDatasetById, putDatasetById } from '@/api/core/dataset';
import { defaultKbDetail } from '@/constants/dataset';
import type { DatasetUpdateParams } from '@/api/core/dataset/index.d';

type State = {
  allDatasets: DatasetsItemType[];
  loadAllDatasets: () => Promise<DatasetsItemType[]>;
  myKbList: DatasetsItemType[];
  loadKbList: (parentId?: string) => Promise<any>;
  setKbList(val: DatasetsItemType[]): void;
  kbDetail: DatasetItemType;
  getKbDetail: (id: string, init?: boolean) => Promise<DatasetItemType>;
  updateDataset: (data: DatasetUpdateParams) => Promise<any>;

  kbTestList: SearchTestItemType[];
  pushKbTestItem: (data: SearchTestItemType) => void;
  delKbTestItemById: (id: string) => void;
  updateKbItemById: (data: SearchTestItemType) => void;
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
        myKbList: [],
        async loadKbList(parentId = '') {
          const res = await getDatasets({ parentId });
          set((state) => {
            state.myKbList = res;
          });
          return res;
        },
        setKbList(val) {
          set((state) => {
            state.myKbList = val;
          });
        },
        kbDetail: defaultKbDetail,
        async getKbDetail(id: string, init = false) {
          if (id === get().kbDetail._id && !init) return get().kbDetail;

          const data = await getDatasetById(id);

          set((state) => {
            state.kbDetail = data;
          });

          return data;
        },
        async updateDataset(data) {
          if (get().kbDetail._id === data.id) {
            set((state) => {
              state.kbDetail = {
                ...state.kbDetail,
                ...data
              };
            });
          }
          set((state) => {
            state.myKbList = state.myKbList = state.myKbList.map((item) =>
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
        kbTestList: [],
        pushKbTestItem(data) {
          set((state) => {
            state.kbTestList = [data, ...state.kbTestList].slice(0, 500);
          });
        },
        delKbTestItemById(id) {
          set((state) => {
            state.kbTestList = state.kbTestList.filter((item) => item.id !== id);
          });
        },
        updateKbItemById(data: SearchTestItemType) {
          set((state) => {
            state.kbTestList = state.kbTestList.map((item) => (item.id === data.id ? data : item));
          });
        }
      })),
      {
        name: 'kbStore',
        partialize: (state) => ({
          kbTestList: state.kbTestList
        })
      }
    )
  )
);
