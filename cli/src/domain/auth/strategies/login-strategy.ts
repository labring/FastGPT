import type { FastGptHttpClient, HttpRequestAuth } from '../../../infra/http/fastgpt-http-client';
import type { CaptchaPreviewer } from '../../../infra/ui/captcha-preview';
import type { Prompter } from '../../../infra/ui/prompter';

export type LoginMethod = 'apiKey' | 'token' | 'password';

export type LoginInputOptions = {
  apiKeyFlag?: string;
  apiKeyStdin?: boolean;
  tokenFlag?: string;
  tokenStdin?: boolean;
  username?: string;
  passwordStdin?: boolean;
  language: 'zh-CN' | 'en' | 'zh-Hant';
};

export type LoginStrategyContext = {
  input: LoginInputOptions;
  client: FastGptHttpClient;
  prompter: Prompter;
  readStdin: () => Promise<string>;
  captchaPreviewer?: CaptchaPreviewer;
};

export type LoginStrategy = {
  readonly method: LoginMethod;
  authenticate: (ctx: LoginStrategyContext) => Promise<HttpRequestAuth>;
};
