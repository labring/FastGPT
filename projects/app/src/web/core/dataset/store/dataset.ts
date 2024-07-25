import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type {
  DatasetListItemType,
  DatasetSimpleItemType
} from '@fastgpt/global/core/dataset/type.d';
import { getAllDataset, getDatasets } from '@/web/core/dataset/api';

type State = {
  allDatasets: DatasetSimpleItemType[];
  loadAllDatasets: () => Promise<DatasetSimpleItemType[]>;
  myDatasets: DatasetListItemType[];
  loadMyDatasets: (parentId?: string) => Promise<DatasetListItemType[]>;
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
        async loadMyDatasets(parentId = '') {
          const res = await getDatasets({ parentId });
          set((state) => {
            state.myDatasets = res;
          });
          return res;
        }
      })),
      {
        name: 'datasetStore',
        partialize: (state) => ({})
      }
    )
  )
);
