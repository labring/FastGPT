import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

type State = {
  loading: boolean;
  setLoading: (val: boolean) => null;
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
      }
    }))
  )
);
