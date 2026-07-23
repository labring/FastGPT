import { create, devtools, immer } from '@fastgpt/web/common/zustand';

export type PasswordChangeAuthorization = {
  token: string;
  expiredAt: string;
  required: boolean;
};

type State = {
  authorization?: PasswordChangeAuthorization;
  setAuthorization: (authorization?: PasswordChangeAuthorization) => void;
};

/** 仅在当前页面进程中承接 OAuth 回跳结果；该 store 不允许接入持久化中间件。 */
export const usePasswordChangeStore = create<State>()(
  devtools(
    immer((set) => ({
      authorization: undefined,
      setAuthorization(authorization) {
        set((state) => {
          state.authorization = authorization;
        });
      }
    }))
  )
);
