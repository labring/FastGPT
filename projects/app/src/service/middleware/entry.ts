import { checkCsrf, parseAllowedOrigins } from '@fastgpt/next/middle/csrf';
import { withNextCors } from '@fastgpt/next/middle/cors';
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

  /** 仅对浏览器携带登录 Cookie 的 GET 请求启用 CSRF 校验，服务间鉴权请求保持兼容。 */
  const shouldCheckCsrf = (req: NextApiRequest) =>
    serviceEnv.CSRF_ENABLED &&
    req.method === 'GET' &&
    !req.headers.rootkey &&
    !req.headers.authorization &&
    !!req.cookies?.fastgpt_token;

  /** 按接口声明顺序执行 CORS 和 CSRF；CSRF 短路时不再继续后置校验。 */
  const beforeRequest = async (req: NextApiRequest, res: NextApiResponse) => {
    await withNextCors({ req, res, allowedOrigins });
    if (res.writableEnded || res.writableFinished) return;

    if (options.csrf !== false && shouldCheckCsrf(req)) {
      await checkCsrf({ req, res });
    }
  };

  return createApiEntry<NextApiRequest, NextApiResponse>({
    beforeCallback: [beforeRequest]
  })(...handlers);
};
