import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import axios from 'axios';
import { OAuthEnum } from '@/constants/user';

type LoginStoreType = { provider: `${OAuthEnum}`; lastRoute: string; state: string };

type State = {
  lastRoute: string;
  setLastRoute: (e: string) => void;
  loginStore?: LoginStoreType;
  setLoginStore: (e: LoginStoreType) => void;
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
    persist(
      immer((set, get) => ({
        lastRoute: '/app/list',
        setLastRoute(e) {
          set((state) => {
            state.lastRoute = e;
          });
        },
        loginStore: undefined,
        setLoginStore(e) {
          set((state) => {
            state.loginStore = e;
          });
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
        isPc: undefined,
        initIsPc(val: boolean) {
          if (get().isPc !== undefined) return;

          set((state) => {
            state.isPc = val;
          });
        },
        gitStar: 3700,
        async loadGitStar() {
          try {
            const { data: git } = await axios.get('https://api.github.com/repos/labring/FastGPT');

            set((state) => {
              state.gitStar = git.stargazers_count;
            });
          } catch (error) {}
        }
      })),
      {
        name: 'globalStore',
        partialize: (state) => ({
          loginStore: state.loginStore
        })
      }
    )
  )
);
