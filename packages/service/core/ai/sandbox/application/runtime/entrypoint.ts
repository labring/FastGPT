/**
 * 沙盒业务层：执行 sandbox 运行态入口脚本并提供初始化并发锁。
 *
 * 负责脚本 hash 状态、输出裁剪和 Redis 临界区保护，不处理具体 Skill 版本部署。
 */
import {
  SANDBOX_ENTRYPOINT_TIMEOUT_SECONDS,
  MAX_LOG_OUTPUT_LENGTH,
  SANDBOX_ENTRYPOINT_STATE_HASH_KEY,
  MAX_ENTRYPOINT_OUTPUT_BYTES,
  SANDBOX_LEASE_WAIT_TIMEOUT_MS
} from '../../constants';
import { isRecoverableSandboxError } from '../../infrastructure/opensandbox/errors';
import type { OpenSandboxClient } from '../../infrastructure/opensandbox/opensandbox';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { isRedisLeaseError, type RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import { getLogger, LogCategories } from '../../../../../common/logger';
import { createAgentSandboxInitializingError } from '../../error';
import { withSandboxLease } from '../lease';
import type { SandboxPrepareContext, SandboxPrepareStep } from './prepare';
import { buildRuntimeHash } from '../../utils';
import {
  getRuntimeStateValue,
  readSandboxRuntimeState,
  runWithSandboxRuntimeStateScope,
  setRuntimeStateValue,
  writeSandboxRuntimeState
} from './state';

const logger = getLogger(LogCategories.MODULE.AI.AGENT);

/**
 * 保护同一个 sandbox 的运行态准备与初始化流程。
 *
 * 通过统一可重入 `withSandboxLease` 覆盖底层实例激活与上层文件部署、entrypoint 和 Skill 扫描，
 * 消除激活与工作区初始化之间的锁断层。锁被并发请求占用时按指数退避有界等待，超时或租约异常转为标准 initializing 错误。
 */
export const withAgentSandboxLease = async <T>({
  sandboxId,
  waitTimeoutMs = SANDBOX_LEASE_WAIT_TIMEOUT_MS,
  retryInitialMs,
  retryMaxMs,
  signal,
  fn
}: {
  sandboxId: string;
  waitTimeoutMs?: number;
  retryInitialMs?: number;
  retryMaxMs?: number;
  signal?: AbortSignal;
  fn: (lease: RedisLeaseContext) => Promise<T>;
}): Promise<T> => {
  try {
    return await withSandboxLease({
      sandboxId,
      label: `agent-sandbox-runtime:${sandboxId}`,
      waitTimeoutMs,
      retryInitialMs,
      retryMaxMs,
      signal,
      fn: async (lease) => await runWithSandboxRuntimeStateScope(() => fn(lease), { lease })
    });
  } catch (error) {
    if (isRedisLeaseError(error)) {
      throw createAgentSandboxInitializingError();
    }
    throw error;
  }
};

/**
 * 执行 runtime sandbox entrypoint。
 *
 * 状态只写入容器临时层 `/var/lib/fastgpt-runtime/state.json`，确保“是否执行过”绑定容器实例生命周期，
 * 不写入 `$HOME` 持久卷；容器休眠唤醒或重建后会在新容器内自动重新初始化系统级依赖。
 * 脚本失败、超时或状态读写失败都不会阻断主流程。
 * scope 必须显式区分应用/节点，只读取该作用域下的成功标记。
 */
export const runAgentSandboxEntrypoint = async ({
  sandbox,
  sandboxEntrypoint,
  workDirectory,
  scope
}: {
  sandbox: OpenSandboxClient;
  sandboxEntrypoint?: string;
  workDirectory?: string;
  scope: string;
}): Promise<void> => {
  const script = sandboxEntrypoint?.trim();
  if (!script) return;

  const stateContext = await readSandboxRuntimeState({ sandbox });
  const stateKey = `${SANDBOX_ENTRYPOINT_STATE_HASH_KEY}:${scope}`;
  const scriptHash = buildRuntimeHash(script);
  if (getRuntimeStateValue(stateContext.state, stateKey) === scriptHash) {
    return;
  }

  const command = buildBashScriptCommand(script);
  const result = await executeEntrypointCommand({
    sandbox,
    command,
    label: 'sandbox',
    workingDirectory: workDirectory
  });

  if (!result) return;

  setRuntimeStateValue({
    state: stateContext.state,
    key: stateKey,
    value: scriptHash
  });
  await writeSandboxRuntimeState({ sandbox, context: stateContext });
};

/** 将 sandbox entrypoint 包装为 prepare step，便于和文件注入、skill 扫描按顺序编排。 */
export const runSandboxEntrypoint =
  <Context extends SandboxPrepareContext>({
    sandboxEntrypoint,
    scope
  }: {
    sandboxEntrypoint?: string;
    scope: string;
  }): SandboxPrepareStep<Context> =>
  async (context) => {
    await runAgentSandboxEntrypoint({
      sandbox: context.sandbox,
      sandboxEntrypoint,
      scope,
      workDirectory: context.workspaceRoot ?? context.workDirectory
    });
    return context;
  };

export const executeEntrypointCommand = async ({
  sandbox,
  command,
  label,
  workingDirectory
}: {
  sandbox: OpenSandboxClient;
  command: string;
  label: string;
  workingDirectory?: string;
}): Promise<boolean> => {
  const result = await sandbox
    .execute(command, {
      timeoutMs: SANDBOX_ENTRYPOINT_TIMEOUT_SECONDS * 1000,
      maxOutputBytes: MAX_ENTRYPOINT_OUTPUT_BYTES,
      workingDirectory
    })
    .catch((error) => {
      if (isRecoverableSandboxError(error)) throw error;
      logger.warn('[Agent Skills] Entrypoint execution threw', {
        label,
        error
      });
      return undefined;
    });

  if (!result) return false;

  if (result.exitCode !== 0) {
    logger.warn('[Agent Skills] Entrypoint execution failed', {
      label,
      exitCode: result.exitCode,
      stdout: truncateOutput(result.stdout),
      stderr: truncateOutput(result.stderr),
      truncated: result.truncated
    });
    return false;
  }

  logger.info('[Agent Skills] Entrypoint execution succeeded', {
    label,
    stdout: truncateOutput(result.stdout),
    stderr: truncateOutput(result.stderr),
    truncated: result.truncated
  });

  return true;
};

export const buildLimitedOutputShellCommand = (scriptCommand: string): string =>
  `/bin/bash -c ${shellQuote(
    `${scriptCommand} > >(tail -c ${MAX_ENTRYPOINT_OUTPUT_BYTES}) 2> >(tail -c ${MAX_ENTRYPOINT_OUTPUT_BYTES} >&2)`
  )}`;

const buildBashScriptCommand = (script: string): string => {
  const encoded = Buffer.from(script, 'utf-8').toString('base64');
  return buildLimitedOutputShellCommand(`printf %s ${shellQuote(encoded)} | base64 -d | /bin/bash`);
};

const truncateOutput = (value: string): string =>
  value.length > MAX_LOG_OUTPUT_LENGTH ? `${value.slice(0, MAX_LOG_OUTPUT_LENGTH)}...` : value;
