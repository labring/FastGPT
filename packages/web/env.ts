import { stripUrlTrailingSlash } from '@fastgpt/global/common/string/url';

export const webEnv = {
  NEXT_PUBLIC_BASE_URL: stripUrlTrailingSlash(process.env.NEXT_PUBLIC_BASE_URL)
};
