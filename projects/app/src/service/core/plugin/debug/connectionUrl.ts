import { serviceEnv } from '@fastgpt/service/env';
import type { ApiRequestProps } from '@fastgpt/next/type';

const getHeaderValue = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

const trimSlash = (value: string) => value.replace(/\/+$/, '');

const getRequestOrigin = (req: ApiRequestProps) => {
  const forwardedProto = getHeaderValue(req.headers['x-forwarded-proto'])?.split(',')[0]?.trim();
  const forwardedHost = getHeaderValue(req.headers['x-forwarded-host'])?.split(',')[0]?.trim();
  const host = forwardedHost || getHeaderValue(req.headers.host)?.trim();

  if (host) {
    const protocol =
      forwardedProto ||
      (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    return `${protocol}://${host}`;
  }

  return serviceEnv.FE_DOMAIN ? trimSlash(serviceEnv.FE_DOMAIN) : '';
};

/**
 * 生成给本地 CLI 使用的 FastGPT HTTP 连接入口。
 * CLI 会直接 GET 这个地址，再由 FastGPT 代理向 plugin-server 兑换短期 connectToken。
 */
export const buildPluginDebugConnectionUrl = ({
  req,
  connectionKey
}: {
  req: ApiRequestProps;
  connectionKey?: string;
}) => {
  if (!connectionKey) return;

  const origin = getRequestOrigin(req);
  if (!origin) return;

  const url = new URL(
    `${serviceEnv.NEXT_PUBLIC_BASE_URL || ''}/api/plugin/debug-channel/connection-key/exchange`,
    origin
  );
  url.searchParams.set('connectionKey', connectionKey);

  return url.toString();
};
