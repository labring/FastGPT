import { z } from 'zod';
import { SessionLifecycleSchema } from '@fastgpt/global/support/user/session/type';
import type { HttpRequestAuth } from '../../infra/http/fastgpt-http-client';
import { CliAuthError, CliError } from '../../shared/errors';
import { SessionErrEnum } from '@fastgpt/global/common/error/code/session';
import { RefreshSessionResponseSchema } from '@fastgpt/global/openapi/support/user/account/session/api';
import { SESSION_REFRESH_REQUEST_TIMEOUT_MS } from '@fastgpt/global/support/user/session/constants';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';

const STORED_SESSION_PREFIX = 'fastgpt-session-v1:';
const StoredSessionSchema = z.object({
  token: z.string().min(1),
  refreshToken: z.string().min(1),
  session: SessionLifecycleSchema,
  receivedAt: z.number().int().nonnegative()
});

/** 只允许在服务端执行业务前明确拒绝 Access 时恢复，普通权限错误或网络故障不重提业务。 */
export const isSessionAccessExpired = (error: unknown): boolean => {
  const reason =
    error instanceof CliError
      ? error.details?.statusText
      : error && typeof error === 'object'
        ? (error as { statusText?: unknown }).statusText
        : undefined;
  return reason === SessionErrEnum.accessExpired || reason === SessionErrEnum.accessMissing;
};

/** 临时传输 / 服务故障允许有效 AT 回退，不吞掉凭证失效或权限拒绝。 */
export const isTemporarySessionRefreshError = (error: unknown): boolean =>
  error instanceof CliError &&
  (error.code === 'NETWORK_ERROR' || Number(error.details?.httpStatus) >= 500);

/** 普通轮换允许复用后继凭证；设备或安全上下文改变时，旧命令必须停止。 */
export const isSameSessionContext = (previous: string, current: string): boolean => {
  if (previous === current) return true;
  const before = /^at\.([^.]*)\.([1-9]\d*)\./.exec(previous);
  const after = /^at\.([^.]*)\.([1-9]\d*)\./.exec(current);
  return Boolean(before && after && before[1] === after[1] && before[2] === after[2]);
};

/** 一次保存完整凭证对，避免 Keychain / 文件中 AT 与 RT 分别写入导致代次错配。 */
export const encodeSessionCredential = (auth: HttpRequestAuth): string => {
  if (auth.authType !== 'token' || !auth.refreshToken || !auth.session) return auth.secret;
  return (
    STORED_SESSION_PREFIX +
    JSON.stringify(
      StoredSessionSchema.parse({
        token: auth.secret,
        refreshToken: auth.refreshToken,
        session: auth.session,
        receivedAt: Date.now()
      })
    )
  );
};

/** 兼容旧明文 Token / API Key 存储，损坏新合同不降级为可发送到服务端的字符串。 */
export const decodeSessionCredential = (stored: string): HttpRequestAuth => {
  if (!stored.startsWith(STORED_SESSION_PREFIX)) return { authType: 'token', secret: stored };
  try {
    const parsed = StoredSessionSchema.parse(
      JSON.parse(stored.slice(STORED_SESSION_PREFIX.length))
    );
    return {
      authType: 'token',
      secret: parsed.token,
      refreshToken: parsed.refreshToken,
      session: parsed.session,
      localAccessExpiresAt:
        parsed.receivedAt + parsed.session.accessExpiresAt - parsed.session.serverTime,
      localRefreshExpiresAt:
        parsed.receivedAt + parsed.session.refreshExpiresAt - parsed.session.serverTime
    };
  } catch {
    throw new CliAuthError({
      code: 'AUTH_INVALID',
      message: 'Stored session credentials are invalid.',
      hint: 'Run fastgpt login again.'
    });
  }
};

/** 仅进行原生客户端 Refresh 兑换；调用方负责在持有凭据锁时原子保存结果。 */
export const refreshNativeSession = async ({
  client,
  auth
}: {
  client: FastGptHttpClient;
  auth: HttpRequestAuth;
}): Promise<HttpRequestAuth> => {
  if (!auth.refreshToken)
    throw new CliAuthError({
      code: 'AUTH_EXPIRED',
      message: 'No Refresh Token is available. Run fastgpt login again.'
    });
  const result = RefreshSessionResponseSchema.parse(
    await client.request({
      method: 'POST',
      path: '/support/user/account/session/refresh',
      body: { refreshToken: auth.refreshToken },
      auth,
      timeoutMs: SESSION_REFRESH_REQUEST_TIMEOUT_MS
    })
  );
  if (result.status !== 'fresh' && (!result.token || !result.refreshToken))
    throw new CliAuthError({
      code: 'AUTH_INVALID',
      message: 'Incomplete refreshed credentials returned by server.'
    });
  return {
    authType: 'token',
    secret: result.token ?? auth.secret,
    refreshToken: result.refreshToken ?? auth.refreshToken,
    session: result.session
  };
};
