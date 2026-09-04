import { create, devtools, immer } from '@fastgpt/web/common/zustand';

export type PasswordChangeSession = {
  sessionId: string;
  expiredAt: string;
  required: boolean;
};

type State = {
  session?: PasswordChangeSession;
  setSession: (session?: PasswordChangeSession) => void;
};

/** 仅在当前页面进程中承接 OAuth 回跳结果；该 store 不允许接入持久化中间件。 */
export const usePasswordChangeStore = create<State>()(
  devtools(
    immer((set) => ({
      session: undefined,
      setSession(session) {
        set((state) => {
          state.session = session;
        });
      }
    }))
  )
);
