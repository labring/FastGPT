import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { InitDateResponse } from '@/pages/api/system/getInitData';
import { getInitData } from '@/api/system';

type State = {
  initData: InitDateResponse;
  loadInitData: () => Promise<void>;
  loading: boolean;
  setLoading: (val: boolean) => null;
  screenWidth: number;
  setScreenWidth: (val: number) => void;
  isPc: boolean;
};

export const useGlobalStore = create<State>()(
  devtools(
    immer((set, get) => ({
      initData: {
        beianText: '',
        googleVerKey: '',
        baiduTongji: false
      },
      async loadInitData() {
        try {
          const res = await getInitData();
          set((state) => {
            state.initData = res;
          });
        } catch (error) {}
      },
      loading: false,
      setLoading: (val: boolean) => {
        set((state) => {
          state.loading = val;
        });
        return null;
      },
      screenWidth: 600,
      setScreenWidth(val: number) {
        set((state) => {
          state.screenWidth = val;
          state.isPc = val < 900 ? false : true;
        });
      },
      isPc: false
    }))
  )
);
