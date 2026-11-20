/**
 * 沙盒业务层：读写 sandbox 运行态 `state.json` 状态文件。
 *
 * 按目标文件生命周期分为两个作用域：
 * - `container`（默认，`/var/lib/fastgpt-runtime/state.json`）：绑定当前容器临时层，记录 `aptMirror`、App/Skill `entrypoint` 与内置 Skill 同步状态，容器销毁重建后自动清空；
 * - `home`（`/home/sandbox/.fastgpt/runtime/state.json`）：跟随 `$HOME` 持久卷与整包 `.tar.zst` 归档，记录写入 `$HOME` 的 `npmMirror`/`pypiMirror` 状态。
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { posix } from 'node:path';
import { isRedisLeaseError, type RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import {
  OPEN_SANDBOX_CONTAINER_RUNTIME_DIR,
  OPEN_SANDBOX_DEFAULT_HOME_PATH,
  SANDBOX_INTERNAL_RUNTIME_DIR_NAME
} from '@fastgpt/global/core/ai/sandbox/constants';
import { z } from 'zod';
import { getLogger, LogCategories } from '../../../../../common/logger';
import {
  isRecoverableSandboxError,
  isSandboxFileNotFoundError
} from '../../infrastructure/opensandbox/errors';
import type { OpenSandboxClient } from '../../infrastructure/opensandbox/opensandbox';
import { joinSandboxPath } from '../../utils';

const logger = getLogger(LogCategories.MODULE.AI.AGENT);

export type SandboxRuntimeStateScope = 'container' | 'home';

const CONTAINER_RUNTIME_STATE_PATH = joinSandboxPath(
  OPEN_SANDBOX_CONTAINER_RUNTIME_DIR,
  'state.json'
);
const HOME_RUNTIME_STATE_PATH = joinSandboxPath(
  OPEN_SANDBOX_DEFAULT_HOME_PATH,
  SANDBOX_INTERNAL_RUNTIME_DIR_NAME,
  'runtime',
  'state.json'
);

export const getSandboxRuntimeStatePath = (
  scope: SandboxRuntimeStateScope = 'container'
): string => (scope === 'home' ? HOME_RUNTIME_STATE_PATH : CONTAINER_RUNTIME_STATE_PATH);

const SandboxRuntimeStateSchema = z.object({
  values: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional()
});
export type SandboxRuntimeState = z.infer<typeof SandboxRuntimeStateSchema>;
type RuntimeStateValue = string | string[];

export type SandboxRuntimeStateContext = {
  state: SandboxRuntimeState;
  readFailed?: boolean;
};

type SandboxScopeCache = {
  states: Partial<Record<SandboxRuntimeStateScope, SandboxRuntimeStateContext>>;
  createdDirs: Set<SandboxRuntimeStateScope>;
};

type RuntimeStateScope = {
  cacheBySandbox: Map<OpenSandboxClient, SandboxScopeCache>;
  lease?: RedisLeaseContext;
};

const runtimeStateScopeStorage = new AsyncLocalStorage<RuntimeStateScope>();

const getSandboxScopeCache = (
  scope: RuntimeStateScope,
  sandbox: OpenSandboxClient
): SandboxScopeCache => {
  let cache = scope.cacheBySandbox.get(sandbox);
  if (!cache) {
    cache = { states: {}, createdDirs: new Set() };
    scope.cacheBySandbox.set(sandbox, cache);
  }
  return cache;
};

const cloneStateContext = (context: SandboxRuntimeStateContext): SandboxRuntimeStateContext => ({
  state: structuredClone(context.state),
  ...(context.readFailed ? { readFailed: true } : {})
});

/**
 * 在单次运行态准备（如 `withAgentSandboxLease` 或 `prepareSandbox`）期间共享 `state.json` 读写缓存；
 * 作用域结束后自动释放，避免容器重置或外部命令修改文件系统后继续命中旧缓存。
 */
export const runWithSandboxRuntimeStateScope = <T>(
  fn: () => Promise<T>,
  options?: { lease?: RedisLeaseContext }
): Promise<T> => {
  const existing = runtimeStateScopeStorage.getStore();
  if (existing) {
    if (options?.lease && !existing.lease) {
      existing.lease = options.lease;
    }
    return fn();
  }
  return runtimeStateScopeStorage.run(
    {
      cacheBySandbox: new Map(),
      lease: options?.lease
    },
    fn
  );
};

const fetchSandboxRuntimeState = async (
  sandbox: OpenSandboxClient,
  scope: SandboxRuntimeStateScope
): Promise<SandboxRuntimeStateContext> => {
  const statePath = getSandboxRuntimeStatePath(scope);
  let readFailed = false;
  const [stateFile] = await sandbox.readFiles([statePath]).catch((error) => {
    if (isRecoverableSandboxError(error)) throw error;
    readFailed = true;
    logger.warn('[Sandbox Runtime] Failed to read runtime state file', { statePath, error });
    return [];
  });
  if (readFailed) {
    return { state: {}, readFailed: true };
  }
  if (!stateFile) {
    return { state: {} };
  }
  if (stateFile.error) {
    if (isSandboxFileNotFoundError(stateFile.error)) {
      return { state: {} };
    }
    if (isRecoverableSandboxError(stateFile.error)) {
      throw stateFile.error;
    }
    logger.warn('[Sandbox Runtime] Failed to read runtime state file', {
      statePath,
      error: stateFile.error
    });
    return { state: {}, readFailed: true };
  }

  const content = Buffer.from(stateFile.content).toString('utf-8');
  if (!content.trim()) {
    return { state: {} };
  }

  try {
    return { state: SandboxRuntimeStateSchema.parse(JSON.parse(content)) };
  } catch (error) {
    logger.warn('[Sandbox Runtime] Failed to parse runtime state file', { statePath, error });
    return { state: {}, readFailed: true };
  }
};

/**
 * 读取指定作用域的 sandbox runtime 状态文件（默认 `container` 容器临时层；传 `home` 读取持久卷 `$HOME` 状态）。
 *
 * 读写或解析失败时返回带 `readFailed` 标记的空状态，避免阻断 Agent 主流程且防止后续回写覆盖有效键。
 */
export const readSandboxRuntimeState = async ({
  sandbox,
  scope: stateScope = 'container'
}: {
  sandbox: OpenSandboxClient;
  scope?: SandboxRuntimeStateScope;
}): Promise<SandboxRuntimeStateContext> => {
  const scope = runtimeStateScopeStorage.getStore();
  const cached = scope?.cacheBySandbox.get(sandbox)?.states[stateScope];
  if (cached) {
    return cloneStateContext(cached);
  }

  const context = await fetchSandboxRuntimeState(sandbox, stateScope);
  if (scope && !context.readFailed) {
    getSandboxScopeCache(scope, sandbox).states[stateScope] = cloneStateContext(context);
  }
  return context;
};

/**
 * 写回指定作用域的 sandbox runtime 状态文件，返回是否写入成功。
 *
 * 调用方应只在对应 runtime 动作成功后更新状态；若快照源自读取失败（`readFailed`），
 * 拒绝回写以免用残缺快照覆盖其他步骤写入的状态键；非可恢复写入失败只记录日志并返回 `false`。
 */
export const writeSandboxRuntimeState = async ({
  sandbox,
  context,
  scope: stateScope = 'container'
}: {
  sandbox: OpenSandboxClient;
  context: SandboxRuntimeStateContext;
  scope?: SandboxRuntimeStateScope;
}): Promise<boolean> => {
  const statePath = getSandboxRuntimeStatePath(stateScope);
  if (context.readFailed) {
    logger.warn(
      '[Sandbox Runtime] Skip writing runtime state snapshot created from a failed read',
      { statePath }
    );
    return false;
  }

  const scope = runtimeStateScopeStorage.getStore();
  const cache = scope ? getSandboxScopeCache(scope, sandbox) : undefined;
  const stateSnapshot = structuredClone(context.state);

  try {
    scope?.lease?.assertValid();
    if (!cache?.createdDirs.has(stateScope)) {
      await sandbox.createDirectories([posix.dirname(statePath)]);
      cache?.createdDirs.add(stateScope);
    }
    scope?.lease?.assertValid();
    const [result] = await sandbox.writeFiles([
      {
        path: statePath,
        data: JSON.stringify(stateSnapshot, null, 2)
      }
    ]);
    if (!result || result.error) {
      throw result?.error ?? new Error('Empty write result for sandbox runtime state');
    }

    if (cache) {
      cache.states[stateScope] = { state: structuredClone(stateSnapshot) };
    }
    return true;
  } catch (error) {
    cache?.createdDirs.delete(stateScope);
    if (cache) {
      delete cache.states[stateScope];
    }
    if (isRedisLeaseError(error) || isRecoverableSandboxError(error)) {
      throw error;
    }
    logger.warn('[Sandbox Runtime] Failed to write runtime state file', { statePath, error });
    return false;
  }
};

export const getRuntimeStateValue = (state: SandboxRuntimeState, key: string): RuntimeStateValue =>
  state.values?.[key] ?? '';

/** 更新 hash 或去重后的版本列表；空字符串或空列表删除对应键，不保留空 values 容器。 */
export const setRuntimeStateValue = ({
  state,
  key,
  value
}: {
  state: SandboxRuntimeState;
  key: string;
  value: RuntimeStateValue;
}): void => {
  const normalizedValue = Array.isArray(value) ? Array.from(new Set(value)) : value;
  state.values ??= {};
  if (normalizedValue === '' || (Array.isArray(normalizedValue) && normalizedValue.length === 0)) {
    delete state.values[key];
  } else {
    state.values[key] = normalizedValue;
  }
  if (Object.keys(state.values).length === 0) {
    delete state.values;
  }
};
