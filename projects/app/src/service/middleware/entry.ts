import { checkCsrf } from '@fastgpt/next/middle/csrf';
import { withNextCors } from '@fastgpt/next/middle/cors';
import type { NextApiRequest, NextApiResponse } from '@fastgpt/next/type';
import { createApiEntry, type ApiHandler } from '@fastgpt/service/common/http/entry';
import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/controller';

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
   * 跨域白名单与 CSRF 开关以实例配置为唯一权威来源：blockStartup 迁移已把
   * ALLOWED_ORIGINS / CSRF_ENABLED 回填进 security 域，请求期不再回落 env，
   * 否则管理员清空白名单/关闭 CSRF 会被 env 初值静默复活（写了不接管）。
   * 空白名单沿用历史"允许所有来源"语义（withNextCors 回显请求 origin）。
   */
  const beforeRequest = async (req: NextApiRequest, res: NextApiResponse) => {
    const security = getSystemInstanceConfig().security;
    const allowedOrigins =
      security.allowedOrigins.length > 0 ? security.allowedOrigins : undefined;

    await withNextCors({ req, res, allowedOrigins });

    if (options.csrf !== false && security.csrfEnabled) {
      await checkCsrf({ req, res });
    }
  };

  return createApiEntry<NextApiRequest, NextApiResponse>({
    beforeCallback: [beforeRequest],
    redactQueryParams: options.redactQueryParams
  })(...handlers);
};
