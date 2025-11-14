import { create, devtools, persist, immer } from '../common/zustand';

type State = {
  copyContent?: string;
  setCopyContent: (val?: string) => void;
};

export const useCommonStore = create<State>()(
  devtools(
    persist(
      immer((set, get) => ({
        copyContent: undefined,
        setCopyContent(val) {
          set((state) => {
            state.copyContent = val;
          });
        }
      })),
      {
        name: 'commonStore',
        partialize: (state) => ({})
      }
    )
  )
);
