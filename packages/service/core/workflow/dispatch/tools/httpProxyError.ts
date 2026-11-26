import { isAxiosError } from 'axios';
import { ServerConfigError, UserConfigError } from '@fastgpt/global/common/error/utils';
import { PRIVATE_URL_TEXT } from '../../../../common/system/utils';

/** 分类后再裁剪代理异常；未知底层故障保留系统告警，绝不保留可能含凭据的原始 cause/config。 */
export const createHttpProxyRequestError = (error: unknown, method: string) => {
  const networkCodes = new Set([
    'ECONNABORTED',
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EPIPE',
    'ERR_CANCELED',
    'ERR_BAD_REQUEST',
    'ERR_BAD_RESPONSE',
    'CERT_HAS_EXPIRED',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'SELF_SIGNED_CERT_IN_CHAIN'
  ]);
  let current = error;
  let code: string | undefined;
  const visited = new Set<unknown>();
  while (typeof current === 'object' && current !== null && !visited.has(current)) {
    visited.add(current);
    if ('code' in current && typeof current.code === 'string') code = current.code;
    current = 'cause' in current ? current.cause : undefined;
  }
  const policyError = error instanceof Error && error.message === PRIVATE_URL_TEXT;
  const response = isAxiosError(error) ? error.response : undefined;
  const external = code ? networkCodes.has(code) : policyError || response !== undefined;
  const message = policyError
    ? PRIVATE_URL_TEXT
    : 'HTTP request through the configured proxy failed';
  const safeError = external ? new UserConfigError(message) : new ServerConfigError(message);
  return Object.assign(safeError, {
    ...(code && /^[A-Z0-9_]+$/.test(code) ? { code } : {}),
    config: { method },
    ...(response
      ? { status: response.status, response: { status: response.status, data: response.data } }
      : {})
  });
};
