import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';

export type SearchTestStoreItemType = {
  id: string;
  datasetId: string;
  text: string;
  time: Date;
  duration: string;
  results: SearchDataResponseItemType[];
  searchMode: `${DatasetSearchModeEnum}`;
  limit: number;
  usingReRank: boolean;
  similarity: number;
  queryExtensionModel?: string;
};

type State = {
  datasetTestList: SearchTestStoreItemType[];
  pushDatasetTestItem: (data: SearchTestStoreItemType) => void;
  delDatasetTestItemById: (id: string) => void;
  updateDatasetItemById: (data: SearchTestStoreItemType) => void;
};

export const useSearchTestStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        datasetTestList: [],
        pushDatasetTestItem(data) {
          set((state) => {
            state.datasetTestList = [data, ...state.datasetTestList].slice(0, 50);
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
        name: 'searchTestStore',
        partialize: (state) => ({
          datasetTestList: state.datasetTestList
        })
      }
    )
  )
);
