import { checkCsrf } from '@fastgpt/next/middle/csrf';
import { parseAllowedOrigins, withNextCors } from '@fastgpt/next/middle/cors';
import type { NextApiRequest, NextApiResponse } from '@fastgpt/next/type';
import { createApiEntry, type ApiHandler } from '@fastgpt/service/common/http/entry';
import { serviceEnv } from '@fastgpt/service/env';

type NextAPIOptions = {
  csrf?: boolean;
};

export const NextAPI = (
  ...args: (ApiHandler<any, NextApiRequest, NextApiResponse> | NextAPIOptions)[]
) => {
  const lastArg = args[args.length - 1];
  const options = typeof lastArg === 'object' ? lastArg : {};
  const handlers = (typeof lastArg === 'object' ? args.slice(0, -1) : args) as ApiHandler<
    any,
    NextApiRequest,
    NextApiResponse
  >[];
  const allowedOrigins = parseAllowedOrigins(serviceEnv.ALLOWED_ORIGINS);

  /** 按接口声明顺序执行 CORS 和 CSRF；CSRF 校验自身负责判断请求是否适用。 */
  const beforeRequest = async (req: NextApiRequest, res: NextApiResponse) => {
    await withNextCors({ req, res, allowedOrigins });

    if (options.csrf !== false && serviceEnv.CSRF_ENABLED) {
      await checkCsrf({ req, res });
    }
  };

  return createApiEntry<NextApiRequest, NextApiResponse>({
    beforeCallback: [beforeRequest]
  })(...handlers);
};
