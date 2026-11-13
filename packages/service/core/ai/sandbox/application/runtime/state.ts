/**
 * 沙盒业务层：读写 sandbox HOME 或持久化工作区下的 FastGPT runtime 状态文件。
 *
 * 按目标产物存储介质区分两类状态生命周期：
 * - 容器根文件系统级（如镜像源、系统内置技能）：保存在 `$HOME/.fastgpt/runtime/state.json`，容器销毁重建后自动重跑；
 * - 持久化工作区级（如 `sandboxEntrypoint`、`skillEntrypoints`）：保存在 `/workspace/.fastgpt/runtime/state.json`，
 *   并绑定容器 `image` 标识，在相同镜像唤醒时跳过重复执行，镜像升级后自动失效重跑。
 */
import {
  OPEN_SANDBOX_DEFAULT_HOME_PATH,
  OPEN_SANDBOX_DEFAULT_ROOT_PATH
} from '@fastgpt/global/core/ai/sandbox/constants';
import type { OpenSandboxClient } from '../../infrastructure/opensandbox/opensandbox';
import { posix } from 'node:path';
import { getLogger, LogCategories } from '../../../../../common/logger';
import { serviceEnv } from '../../../../../env';
import { joinSandboxPath } from '../../utils';
import { z } from 'zod';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

const RUNTIME_STATE_DIR_RELATIVE_PATH = '.fastgpt/runtime';
const RUNTIME_STATE_FILE_NAME = 'state.json';

const SandboxRuntimeStateSchema = z.object({
  image: z.string().optional(),
  values: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional()
});
export type SandboxRuntimeState = z.infer<typeof SandboxRuntimeStateSchema>;
type RuntimeStateValue = string | string[];

export type SandboxRuntimeStateContext = {
  statePath?: string;
  state: SandboxRuntimeState;
};

const readStateFileAtBaseDir = async ({
  sandbox,
  baseDirectory
}: {
  sandbox: OpenSandboxClient;
  baseDirectory: string;
}): Promise<SandboxRuntimeStateContext> => {
  const statePath = joinSandboxPath(
    baseDirectory,
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
 * 读取 sandbox HOME 下的容器级 runtime 状态文件（随容器销毁清空）。
 *
 * 用于产物落在容器根文件系统（如 `/home/sandbox` 或 `/etc/apt`）的步骤，确保新容器唤醒后重新同步。
 */
export const readSandboxRuntimeState = async ({
  sandbox,
  homeDirectory = OPEN_SANDBOX_DEFAULT_HOME_PATH
}: {
  sandbox: OpenSandboxClient;
  homeDirectory?: string;
}): Promise<SandboxRuntimeStateContext> => {
  return readStateFileAtBaseDir({ sandbox, baseDirectory: homeDirectory });
};

/**
 * 读取持久化工作区（默认 `/workspace/.fastgpt/runtime/state.json`）下的工作区级 runtime 状态文件。
 *
 * 当传入或环境变量配置了当前容器镜像标识 `expectedImage` 时，若历史状态记录的 `image` 与之不一致，
 * 自动清空旧 `values` 并将 `state.image` 更新为最新镜像，保证底层镜像升级后初始化脚本自动重跑。
 */
export const readSandboxWorkspaceRuntimeState = async ({
  sandbox,
  workspaceDirectory = OPEN_SANDBOX_DEFAULT_ROOT_PATH,
  currentImage
}: {
  sandbox: OpenSandboxClient;
  workspaceDirectory?: string;
  currentImage?: string;
}): Promise<SandboxRuntimeStateContext> => {
  const expectedImage =
    currentImage?.trim() || serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE?.trim() || undefined;
  const { statePath, state } = await readStateFileAtBaseDir({
    sandbox,
    baseDirectory: workspaceDirectory
  });

  if (expectedImage && state.image !== expectedImage) {
    return {
      statePath,
      state: { image: expectedImage }
    };
  }

  return {
    statePath,
    state: expectedImage ? { ...state, image: expectedImage } : state
  };
};

/**
 * 写回 sandbox runtime 状态文件。
 *
 * 调用方应只在对应 runtime 动作成功后更新状态；写入失败只记录日志，
 * 下次运行会按未执行重新尝试。
 */
export const writeSandboxRuntimeState = async (
  sandbox: OpenSandboxClient,
  { statePath, state }: SandboxRuntimeStateContext
): Promise<void> => {
  if (!statePath) return;

  try {
    await sandbox.createDirectories([posix.dirname(statePath)]);
    await sandbox.writeFiles([
      {
        path: statePath,
        data: JSON.stringify(state, null, 2)
      }
    ]);
  } catch (error) {
    logger.warn('[Sandbox Runtime] Failed to write runtime state file', { statePath, error });
  }
};

/** 读取指定键的 runtime 状态值；未命中时返回空字符串。 */
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
