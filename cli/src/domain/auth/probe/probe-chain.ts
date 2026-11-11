import type { WhoamiResponseType } from '@fastgpt/global/openapi/support/user/account/whoami/api';
import type { FastGptHttpClient, HttpRequestAuth } from '../../../infra/http/fastgpt-http-client';
import { CliApiError } from '../../../shared/errors';

export type WhoamiProbeSource = 'whoami' | 'tokenLogin' | 'openapiHealth' | 'datasetProbe';

export type WhoamiProbeResult = {
  source: WhoamiProbeSource;
  supportsWhoami: boolean;
  authType: 'token' | 'apikey';
  apiKeyType?: 'personal' | 'app';
  detail?: WhoamiResponseType;
  fallbackInfo?: {
    userId?: string;
    username?: string;
    avatar?: string | null;
    teamId?: string;
    teamName?: string;
    tmbId?: string;
    boundAppId?: string;
    usagePoints?: number;
    maxUsagePoints?: number;
    remainingPoints?: number | null;
  };
  warnings: string[];
};

export type WhoamiProbeHandler = {
  readonly name: WhoamiProbeSource;
  supports: (auth: HttpRequestAuth) => boolean;
  probe: (params: {
    client: FastGptHttpClient;
    auth: HttpRequestAuth;
  }) => Promise<WhoamiProbeResult>;
};

export function isNotFoundError(error: unknown): boolean {
  return error instanceof CliApiError && (error.httpStatus === 404 || error.serverCode === 404);
}

/**
 * 责任链调度器：按优先级依次尝试探测处理器；
 * 仅当某级返回 404（服务端未升级）时向下一级回退，认证/业务/网络异常立即中断上报。
 */
export async function runWhoamiProbeChain({
  handlers,
  client,
  auth
}: {
  handlers: readonly WhoamiProbeHandler[];
  client: FastGptHttpClient;
  auth: HttpRequestAuth;
}): Promise<WhoamiProbeResult> {
  let lastNotFoundError: unknown;

  for (const handler of handlers) {
    if (!handler.supports(auth)) {
      continue;
    }

    try {
      return await handler.probe({ client, auth });
    } catch (error) {
      if (isNotFoundError(error)) {
        lastNotFoundError = error;
        continue;
      }
      throw error;
    }
  }

  throw (
    lastNotFoundError ??
    new CliApiError({
      message: 'No compatible whoami probe handler matched current credential.'
    })
  );
}
