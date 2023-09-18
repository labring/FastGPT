import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { type KbTestItemType } from '@/types/plugin';
import type { KbItemType, KbListItemType } from '@/types/plugin';
import { getKbList, getKbById, getAllDataset, putKbById } from '@/api/plugins/kb';
import { defaultKbDetail } from '@/constants/kb';
import { KbUpdateParams } from '@/api/request/kb';

type State = {
  datasets: KbListItemType[];
  loadAllDatasets: () => Promise<KbListItemType[]>;
  myKbList: KbListItemType[];
  loadKbList: (parentId?: string) => Promise<any>;
  setKbList(val: KbListItemType[]): void;
  kbDetail: KbItemType;
  getKbDetail: (id: string, init?: boolean) => Promise<KbItemType>;
  updateDataset: (data: KbUpdateParams) => Promise<any>;

  kbTestList: KbTestItemType[];
  pushKbTestItem: (data: KbTestItemType) => void;
  delKbTestItemById: (id: string) => void;
  updateKbItemById: (data: KbTestItemType) => void;
};

export const useDatasetStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        datasets: [],
        async loadAllDatasets() {
          const res = await getAllDataset();
          set((state) => {
            state.datasets = res;
          });
          return res;
        },
        myKbList: [],
        async loadKbList(parentId = '') {
          const res = await getKbList({ parentId });
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

          const data = await getKbById(id);

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
          await putKbById(data);
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
        updateKbItemById(data: KbTestItemType) {
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
