import { checkCsrf } from '@fastgpt/next/middle/csrf';
import { parseAllowedOrigins, withNextCors } from '@fastgpt/next/middle/cors';
import type { NextApiRequest, NextApiResponse } from '@fastgpt/next/type';
import { createApiEntry, type ApiHandler } from '@fastgpt/service/common/http/entry';
import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/controller';
import { serviceEnv } from '@fastgpt/service/env';

type NextAPIOptions = {
  csrf?: boolean;
  redactQueryParams?: string[];
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

  /**
   * 按接口声明顺序执行 CORS 和 CSRF。
   * 优先读取实例配置（动态可配），未配置时回退 serviceEnv 初值；
   * 每请求动态解析，保证 Admin 修改跨域或 CSRF 后立即生效。
   */
  const beforeRequest = async (req: NextApiRequest, res: NextApiResponse) => {
    const security = getSystemInstanceConfig().security;
    const allowedOrigins =
      security.allowedOrigins && security.allowedOrigins.length > 0
        ? security.allowedOrigins
        : parseAllowedOrigins(serviceEnv.ALLOWED_ORIGINS);

    await withNextCors({ req, res, allowedOrigins });

    const csrfEnabled = security.csrfEnabled ?? serviceEnv.CSRF_ENABLED;
    if (options.csrf !== false && csrfEnabled) {
      await checkCsrf({ req, res });
    }
  };

  return createApiEntry<NextApiRequest, NextApiResponse>({
    beforeCallback: [beforeRequest],
    redactQueryParams: options.redactQueryParams
  })(...handlers);
};
