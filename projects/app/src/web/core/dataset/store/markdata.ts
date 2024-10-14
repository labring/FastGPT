import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export type MarkDataStore = {
  dataId: string;
  datasetId?: string;
  collectionId?: string;
  q: string;
  a: string;
};
export type MarkDataCallback = (data: MarkDataStore) => void;

type State = {
  markData?: MarkDataStore;
  markDataCallback?: MarkDataCallback;
  startMarkData: (data: MarkDataStore, cb: MarkDataCallback) => void;
  updateMarkData: (data: MarkDataStore) => void;
};

export const useSearchTestStore = create<State>()(
  devtools(
    immer((set, get) => ({
      markData: undefined,
      markDataCallback: undefined,
      startMarkData(data, cb) {
        set((state) => {
          state.markData = data;
          state.markDataCallback = cb;
        });
      },
      updateMarkData(data: MarkDataStore) {
        set((state) => {
          state.markData = data;
        });
      }
    }))
  )
);
