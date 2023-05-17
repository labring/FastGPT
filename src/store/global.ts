import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

type State = {
  loading: boolean;
  setLoading: (val: boolean) => null;
  screenWidth: number;
  setScreenWidth: (val: number) => void;
  isPc: boolean;
};

export const useGlobalStore = create<State>()(
  devtools(
    immer((set, get) => ({
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
