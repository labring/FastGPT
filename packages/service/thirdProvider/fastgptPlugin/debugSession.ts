import { serviceEnv } from '../../env';
import {
  DisconnectPluginDebugSessionResponseSchema,
  PluginDebugSessionCreateResultSchema,
  PluginDebugSessionExchangeResultSchema,
  PluginDebugSessionStatusResponseSchema,
  type DisconnectPluginDebugSessionResponseType,
  type PluginDebugSessionExchangeResultType
} from '@fastgpt/global/openapi/core/plugin/debug/api';
import type {
  CreatePluginDebugSessionResponseType,
  PluginDebugSessionStatusResponseType
} from '@fastgpt/global/openapi/core/plugin/debug/api';

const PLUGIN_DEBUG_SESSION_TTL_MS = 4 * 60 * 60 * 1000;

type PluginServerResponse<T> = {
  data?: T;
  error?: unknown;
  message?: unknown;
  msg?: unknown;
};

const getPluginBaseUrl = () => serviceEnv.PLUGIN_BASE_URL.replace(/\/$/, '');

/**
 * 调用 plugin-server debug session API。
 * 当前 SDK file 依赖已包含 debug DTO，但 client 方法尚未暴露；这里集中封装协议调用，
 * 后续 SDK 稳定后只需要替换此文件内部实现。
 */
async function requestPluginServer<T>({
  path,
  method,
  body
}: {
  path: string;
  method: 'GET' | 'POST';
  body?: Record<string, unknown>;
}): Promise<T> {
  const response = await fetch(`${getPluginBaseUrl()}${path}`, {
    method,
    headers: {
      ...(serviceEnv.PLUGIN_TOKEN ? { Authorization: `Bearer ${serviceEnv.PLUGIN_TOKEN}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = (await response.json().catch(() => undefined)) as
    | PluginServerResponse<T>
    | T
    | undefined;

  if (!response.ok) {
    throw new Error(getPluginServerErrorMessage(payload) || response.statusText || 'Plugin error');
  }

  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as PluginServerResponse<T>).data as T;
  }

  return payload as T;
}

function getPluginServerErrorMessage(payload: unknown): string | undefined {
  if (!payload) return undefined;
  if (typeof payload === 'string') return payload;

  if (typeof payload !== 'object') {
    return String(payload);
  }

  const record = payload as Record<string, unknown>;
  const error = record.error ?? record.message ?? record.msg;
  if (!error) return undefined;

  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const nested = error as Record<string, unknown>;
    const message = nested.message ?? nested.msg ?? nested.code;
    if (typeof message === 'string') return message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return undefined;
  }
}

function buildDebugConnectUrl({ baseUrl, ticket }: { baseUrl: string; ticket: string }) {
  const url = new URL('/api/plugin/debug/connect', baseUrl);
  url.searchParams.set('ticket', ticket);
  return url.toString();
}

export async function createPluginDebugSession({
  tmbId,
  ttlMs,
  fastgptBaseUrl
}: {
  tmbId: string;
  ttlMs?: number;
  fastgptBaseUrl: string;
}): Promise<CreatePluginDebugSessionResponseType> {
  const data = await requestPluginServer<unknown>({
    path: '/api/plugin/debug-sessions',
    method: 'POST',
    body: {
      tmbId,
      // plugin-server 会在 TTL 到期后主动断连并释放调试资源。
      ttlMs: ttlMs ?? PLUGIN_DEBUG_SESSION_TTL_MS
    }
  });
  const session = PluginDebugSessionCreateResultSchema.parse(data);
  const connectUrl = buildDebugConnectUrl({
    baseUrl: fastgptBaseUrl,
    ticket: session.ticket
  });

  return {
    ...session,
    connectUrl,
    cliCommand: `fastgpt-plugin debug ./plugin-a --connect "${connectUrl}"`
  };
}

export async function exchangePluginDebugTicket({
  ticket
}: {
  ticket: string;
}): Promise<PluginDebugSessionExchangeResultType> {
  const data = await requestPluginServer<unknown>({
    path: '/api/plugin/debug-sessions/tickets:exchange',
    method: 'POST',
    body: {
      ticket
    }
  });

  return PluginDebugSessionExchangeResultSchema.parse(data);
}

export async function getPluginDebugSessionStatus({
  tmbId,
  debugSessionId
}: {
  tmbId: string;
  debugSessionId: string;
}): Promise<PluginDebugSessionStatusResponseType> {
  const query = new URLSearchParams({ tmbId });
  const data = await requestPluginServer<unknown>({
    path: `/api/plugin/debug-sessions/${encodeURIComponent(debugSessionId)}?${query.toString()}`,
    method: 'GET'
  });

  return PluginDebugSessionStatusResponseSchema.parse(data);
}

export async function revokePluginDebugSession({
  tmbId,
  debugSessionId,
  reason = 'user-disconnect'
}: {
  tmbId: string;
  debugSessionId: string;
  reason?: string;
}): Promise<DisconnectPluginDebugSessionResponseType> {
  const data = await requestPluginServer<unknown>({
    path: `/api/plugin/debug-sessions/${encodeURIComponent(debugSessionId)}/revoke`,
    method: 'POST',
    body: {
      tmbId,
      reason
    }
  });

  return DisconnectPluginDebugSessionResponseSchema.parse(data);
}
