import { serviceEnv } from '../../env';
import {
  FastGPTPluginClient,
  type ToolAnswerType,
  type ToolHandlerReturnType
} from '@fastgpt/global/sdk/fastgpt-plugin';

export const PLUGIN_BASE_URL = serviceEnv.PLUGIN_BASE_URL ?? '';
export const PLUGIN_TOKEN = serviceEnv.PLUGIN_TOKEN;

export const pluginClient = new FastGPTPluginClient({
  baseUrl: PLUGIN_BASE_URL,
  token: PLUGIN_TOKEN
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
