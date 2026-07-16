import { serviceEnv } from '../../env';
import {
  FastGPTPluginClient,
  type PluginInstallResultType,
  type PluginUniqueIdType,
  type ToolAnswerType,
  type ToolHandlerReturnType
} from '@fastgpt/global/sdk/fastgpt-plugin';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { AsyncLocalStorage } from 'async_hooks';

export const PLUGIN_BASE_URL = serviceEnv.PLUGIN_BASE_URL ?? '';
export const PLUGIN_TOKEN = serviceEnv.PLUGIN_TOKEN;

const PluginClientLocaleContext = new AsyncLocalStorage<localeType | undefined>();

export const withPluginClientLocale = <T>(lang: localeType | undefined, fn: () => Promise<T>) => {
  return PluginClientLocaleContext.run(lang, fn);
};

const localizePluginErrorResponse = async (response: Response): Promise<Response> => {
  const lang = PluginClientLocaleContext.getStore();
  if (response.ok || !lang) return response;

  const contentType = response.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) return response;

  const payload = await response
    .clone()
    .json()
    .catch(() => undefined);
  const reason = payload?.error?.reason;
  if (!reason || typeof reason !== 'object' || typeof reason.en !== 'string') return response;
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');

  return new Response(
    JSON.stringify({
      ...payload,
      error: {
        ...payload.error,
        message: parseI18nString(reason, lang)
      }
    }),
    {
      status: response.status,
      statusText: response.statusText,
      headers
    }
  );
};

const localizedFetch: typeof globalThis.fetch = async (input, init) => {
  const response = await fetch(input, init);
  return localizePluginErrorResponse(response);
};

export const pluginClient = new FastGPTPluginClient({
  baseUrl: PLUGIN_BASE_URL,
  token: PLUGIN_TOKEN,
  fetch: localizedFetch
});

type RunPluginToolStreamParams = {
  pluginId: string;
  version?: string;
  source?: string;
  secrets?: Record<string, unknown>;
  systemVar: Record<string, unknown>;
  input: Record<string, unknown>;
  childId?: string;
  onMessage?: (message: ToolAnswerType) => void;
};

type ToolStreamMessage =
  | {
      type: 'response';
      data: ToolHandlerReturnType;
    }
  | {
      type: 'stream';
      data: ToolAnswerType;
    }
  | {
      type: 'error';
      data: unknown;
    };

const buildPluginApiUrl = (path: string) => {
  const baseUrl = PLUGIN_BASE_URL.endsWith('/') ? PLUGIN_BASE_URL.slice(0, -1) : PLUGIN_BASE_URL;
  return `${baseUrl}${path}`;
};

const normalizePluginUniqueId = (id: PluginUniqueIdType): PluginUniqueIdType => ({
  ...id,
  pluginId: id.pluginId.replace(/^systemTool-/, '')
});

const requestPluginService = async <T = unknown>({
  path,
  body
}: {
  path: string;
  body: Record<string, unknown>;
}): Promise<T> => {
  const response = await localizedFetch(buildPluginApiUrl(path), {
    method: 'POST',
    headers: {
      ...(PLUGIN_TOKEN ? { Authorization: `Bearer ${PLUGIN_TOKEN}` } : {}),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text().catch(() => response.statusText);
    return Promise.reject(error || response.statusText);
  }

  const text = await response.text().catch(() => '');
  if (!text) return undefined as T;

  try {
    const payload = JSON.parse(text);
    return (payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload) as T;
  } catch {
    return text as T;
  }
};

/**
 * 临时补齐 SDK 还未暴露的 team source 安装能力。
 * plugin service 已经按 source 隔离 list/detail/runtime；这里要求 confirm/install/delete
 * 也显式写入当前 team source，避免团队插件落到 system source。
 */
export const confirmPluginToSource = (uniqueIds: PluginUniqueIdType[], source: string) =>
  requestPluginService<void>({
    path: '/plugin/confirm',
    body: {
      uniqueIds: uniqueIds.map(normalizePluginUniqueId),
      source
    }
  });

export const installPluginsToSource = (urls: string[], source: string) =>
  requestPluginService<PluginInstallResultType>({
    path: '/plugin/install',
    body: {
      urls,
      source
    }
  });

export const deletePluginFromSource = ({
  pluginId,
  source,
  version
}: {
  pluginId: string;
  source: string;
  version: string;
}) =>
  requestPluginService<void>({
    path: '/plugin/delete',
    body: {
      pluginId: pluginId.replace(/^systemTool-/, ''),
      source,
      version
    }
  });

const parseSseData = (chunk: string): ToolStreamMessage | null => {
  const data = chunk
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .join('\n');

  if (!data) return null;

  try {
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
};

export const runPluginToolStream = async ({
  onMessage,
  ...params
}: RunPluginToolStreamParams): Promise<{
  output?: ToolHandlerReturnType;
  error?: unknown;
}> => {
  const response = await fetch(buildPluginApiUrl('/api/tool/runStream'), {
    method: 'POST',
    headers: {
      ...(PLUGIN_TOKEN ? { Authorization: `Bearer ${PLUGIN_TOKEN}` } : {}),
      Accept: 'text/event-stream',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });

  if (!response.ok) {
    const error = await response.text().catch(() => response.statusText);
    return {
      error: error || response.statusText
    };
  }

  if (!response.body) {
    return {
      error: 'Tool stream response body is empty'
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let output: ToolHandlerReturnType | undefined;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';

    for (const chunk of chunks) {
      const message = parseSseData(chunk);
      if (!message) continue;

      if (message.type === 'stream') {
        onMessage?.(message.data);
      } else if (message.type === 'response') {
        output = message.data;
      } else if (message.type === 'error') {
        return {
          error: message.data
        };
      }
    }

    if (done) break;
  }

  const message = parseSseData(buffer);
  if (message?.type === 'stream') {
    onMessage?.(message.data);
  } else if (message?.type === 'response') {
    output = message.data;
  } else if (message?.type === 'error') {
    return {
      error: message.data
    };
  }

  return {
    output
  };
};
