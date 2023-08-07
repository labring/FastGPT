import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import axios from 'axios';

type State = {
  loading: boolean;
  setLoading: (val: boolean) => null;
  screenWidth: number;
  setScreenWidth: (val: number) => void;
  isPc?: boolean;
  initIsPc(val: boolean): void;
  gitStar: number;
  loadGitStar: () => Promise<void>;
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
      isPc: undefined,
      initIsPc(val: boolean) {
        if (get().isPc !== undefined) return;

        set((state) => {
          state.isPc = val;
        });
      },
      gitStar: 2700,
      async loadGitStar() {
        try {
          const { data: git } = await axios.get('https://api.github.com/repos/labring/FastGPT');

          set((state) => {
            state.gitStar = git.stargazers_count;
          });
        } catch (error) {}
      }
    }))
  )
);
