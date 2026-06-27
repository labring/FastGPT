import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { getLogger, LogCategories } from '../../../../common/logger';
import { resolveSandboxHome } from './home';
import { joinSandboxPath } from './utils';

const logger = getLogger(LogCategories.MODULE.AI.AGENT);

const RUNTIME_STATE_DIR_RELATIVE_PATH = '.fastgpt/runtime';
const RUNTIME_STATE_FILE_NAME = 'state.json';

type RuntimeStateValue = string | string[];

export type SandboxRuntimeState = {
  values?: Record<string, RuntimeStateValue>;
};

export type SandboxRuntimeStateContext = {
  statePath?: string;
  state: SandboxRuntimeState;
};

type RuntimeStateLocation = Pick<SandboxRuntimeStateContext, 'statePath'>;

/**
 * 读取 sandbox HOME 下的 FastGPT runtime 状态文件。
 *
 * 该文件只记录“某段 runtime 逻辑是否已经针对当前 sandbox 成功执行过”的轻量状态，
 * 例如 entrypoint hash、内置文件 etag、skill version marker。读写失败时返回空状态，
 * 让上层逻辑按未执行处理，避免阻断 agent 主流程。
 */
export const readSandboxRuntimeState = async ({
  sandbox,
  homeDirectory
}: {
  sandbox: ISandbox;
  homeDirectory?: string;
}): Promise<SandboxRuntimeStateContext> => {
  const location = await resolveRuntimeStateLocation({ sandbox, homeDirectory });
  const { statePath } = location;
  if (!statePath) {
    return {
      state: {}
    };
  }

  const [stateFile] = await sandbox.readFiles([statePath]).catch((error) => {
    logger.warn('[Sandbox Runtime] Failed to read runtime state file', {
      statePath,
      error
    });
    return [];
  });

  if (!stateFile || stateFile.error) {
    return {
      statePath,
      state: {}
    };
  }

  try {
    const content = Buffer.from(stateFile.content).toString('utf-8');
    if (!content.trim()) {
      return {
        statePath,
        state: {}
      };
    }

    return {
      statePath,
      state: normalizeRuntimeState(JSON.parse(content))
    };
  } catch (error) {
    logger.warn('[Sandbox Runtime] Failed to parse runtime state file', {
      statePath,
      error
    });
    return {
      statePath,
      state: {}
    };
  }
};

/**
 * 写回 sandbox runtime 状态文件。
 *
 * 调用方应只在对应 runtime 动作成功后更新状态；写入失败只记录日志，
 * 下次运行会按未执行重新尝试。
 */
export const writeSandboxRuntimeState = async (
  sandbox: ISandbox,
  { statePath, state }: SandboxRuntimeStateContext
): Promise<void> => {
  if (!statePath) return;

  const normalizedState = normalizeRuntimeState(state);
  const writeResult = await sandbox
    .writeFiles([
      {
        path: statePath,
        data: JSON.stringify(normalizedState, null, 2)
      }
    ])
    .catch((error) => {
      logger.warn('[Sandbox Runtime] Failed to write runtime state file', {
        statePath,
        error
      });
      return [];
    });

  const failed = writeResult.find((item) => item.error);
  if (failed) {
    logger.warn('[Sandbox Runtime] Failed to write runtime state file', {
      statePath,
      error: failed.error
    });
  }
};

export const getRuntimeStateValue = (state: SandboxRuntimeState, key: string): RuntimeStateValue =>
  state.values?.[key] ?? '';

export const setRuntimeStateValue = (
  state: SandboxRuntimeState,
  key: string,
  value: RuntimeStateValue
): void => {
  const normalizedValue = Array.isArray(value) ? Array.from(new Set(value)) : value;
  state.values = {
    ...(state.values ?? {}),
    ...(Array.isArray(normalizedValue) && normalizedValue.length === 0
      ? {}
      : { [key]: normalizedValue })
  };
  if (Array.isArray(normalizedValue) && normalizedValue.length === 0) {
    delete state.values[key];
  }
  if (Object.keys(state.values).length === 0) {
    delete state.values;
  }
};

const resolveRuntimeStateLocation = async ({
  sandbox,
  homeDirectory
}: {
  sandbox: ISandbox;
  homeDirectory?: string;
}): Promise<RuntimeStateLocation> => {
  const homeDir = homeDirectory || (await resolveSandboxHome(sandbox));
  if (!homeDir) {
    return {};
  }

  const stateDir = joinSandboxPath(homeDir, RUNTIME_STATE_DIR_RELATIVE_PATH);
  const statePath = joinSandboxPath(stateDir, RUNTIME_STATE_FILE_NAME);

  const prepareResult = await sandbox
    .execute(`mkdir -p ${shellQuote(stateDir)}`, {
      timeoutMs: 5_000,
      maxOutputBytes: 1024
    })
    .catch((error) => {
      logger.warn('[Sandbox Runtime] Failed to prepare runtime state directory', {
        stateDir,
        error
      });
      return undefined;
    });
  if (!prepareResult || prepareResult.exitCode !== 0) {
    return {};
  }

  return {
    statePath
  };
};

const normalizeRuntimeState = (value: unknown): SandboxRuntimeState => {
  if (!value || typeof value !== 'object') return {};
  const raw = value as SandboxRuntimeState;
  const values = {
    ...normalizeStringRecord((raw as { hashes?: unknown }).hashes),
    ...normalizeStringListRecord((raw as { lists?: unknown }).lists),
    ...normalizeRuntimeStateValueRecord(raw.values)
  };

  return Object.keys(values).length > 0 ? { values } : {};
};

const normalizeStringRecord = (value: unknown): Record<string, string> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] =>
      typeof entry[0] === 'string' && typeof entry[1] === 'string'
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const normalizeStringListRecord = (value: unknown): Record<string, string[]> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;

  const entries = Object.entries(value).flatMap(([key, list]) => {
    if (!Array.isArray(list)) return [];

    const values = Array.from(new Set(list.filter((item) => typeof item === 'string')));
    return values.length > 0 ? [[key, values] as const] : [];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const normalizeRuntimeStateValueRecord = (
  value: unknown
): Record<string, RuntimeStateValue> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;

  const entries: Array<[string, RuntimeStateValue]> = [];

  Object.entries(value).forEach(([key, item]) => {
    if (typeof item === 'string') {
      entries.push([key, item]);
      return;
    }
    if (!Array.isArray(item)) return;
    const values = Array.from(new Set(item.filter((value) => typeof value === 'string')));
    if (values.length > 0) {
      entries.push([key, values]);
    }
  });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};
