/**
 * 沙盒业务层：读写 sandbox HOME 下的 FastGPT runtime 状态文件。
 *
 * 只记录轻量执行标记，不承担数据库状态或 provider 生命周期管理。
 */
import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { posix } from 'node:path';
import { getLogger, LogCategories } from '../../../../../common/logger';
import { resolveSandboxHome } from './home';
import { joinSandboxPath } from '../../utils';
import { z } from 'zod';

const logger = getLogger(LogCategories.MODULE.AI.AGENT);

const RUNTIME_STATE_DIR_RELATIVE_PATH = '.fastgpt/runtime';
const RUNTIME_STATE_FILE_NAME = 'state.json';

const SandboxRuntimeStateSchema = z.object({
  values: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional()
});
export type SandboxRuntimeState = z.infer<typeof SandboxRuntimeStateSchema>;
type RuntimeStateValue = string | string[];

export type SandboxRuntimeStateContext = {
  statePath?: string;
  state: SandboxRuntimeState;
};

/**
 * 读取 sandbox HOME 下的 FastGPT runtime 状态文件。
 *
 * 该文件只记录“某段 runtime 逻辑是否已经针对当前 sandbox 成功执行过”的轻量状态，
 * 例如 entrypoint hash、内置文件 etag、skill version marker。读写或解析失败时返回空状态，
 * 让上层逻辑按未执行处理，避免阻断 Agent 主流程。
 */
export const readSandboxRuntimeState = async ({
  sandbox,
  homeDirectory
}: {
  sandbox: ISandbox;
  homeDirectory?: string;
}): Promise<SandboxRuntimeStateContext> => {
  const homeDir = homeDirectory ?? (await resolveSandboxHome(sandbox));
  if (!homeDir) {
    return { state: {} };
  }
  const statePath = joinSandboxPath(
    homeDir,
    RUNTIME_STATE_DIR_RELATIVE_PATH,
    RUNTIME_STATE_FILE_NAME
  );

  const [stateFile] = await sandbox.readFiles([statePath]).catch((error) => {
    logger.warn('[Sandbox Runtime] Failed to read runtime state file', { statePath, error });
    return [];
  });
  if (!stateFile || stateFile.error) {
    return { statePath, state: {} };
  }

  const content = Buffer.from(stateFile.content).toString('utf-8');
  if (!content.trim()) {
    return { statePath, state: {} };
  }

  try {
    return { statePath, state: SandboxRuntimeStateSchema.parse(JSON.parse(content)) };
  } catch (error) {
    logger.warn('[Sandbox Runtime] Failed to parse runtime state file', { statePath, error });
    return { statePath, state: {} };
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

  try {
    await sandbox.createDirectories([posix.dirname(statePath)]);
    const [result] = await sandbox.writeFiles([
      {
        path: statePath,
        data: JSON.stringify(state, null, 2)
      }
    ]);
    if (!result) throw new Error('Sandbox runtime state write returned no result');
    if (result.error) throw result.error;
  } catch (error) {
    logger.warn('[Sandbox Runtime] Failed to write runtime state file', { statePath, error });
  }
};

export const getRuntimeStateValue = (state: SandboxRuntimeState, key: string): RuntimeStateValue =>
  state.values?.[key] ?? '';

/** 更新 hash 或去重后的版本列表；空列表删除对应键，不保留空 values 容器。 */
export const setRuntimeStateValue = (
  state: SandboxRuntimeState,
  key: string,
  value: RuntimeStateValue
): void => {
  const normalizedValue = Array.isArray(value) ? Array.from(new Set(value)) : value;
  state.values ??= {};
  if (Array.isArray(normalizedValue) && normalizedValue.length === 0) {
    delete state.values[key];
  } else {
    state.values[key] = normalizedValue;
  }
  if (Object.keys(state.values).length === 0) {
    delete state.values;
  }
};
