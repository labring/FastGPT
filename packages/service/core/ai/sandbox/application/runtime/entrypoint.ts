/**
 * 沙盒业务层：执行 sandbox 运行态入口脚本并提供初始化并发锁。
 *
 * 负责脚本 hash 状态、输出裁剪和 Redis 临界区保护，不处理具体 Skill 版本部署。
 */
import {
  MAX_LOG_OUTPUT_LENGTH,
  SANDBOX_ENTRYPOINT_STATE_HASH_KEY,
  MAX_ENTRYPOINT_OUTPUT_BYTES,
  SANDBOX_INIT_LEASE_TTL_MS,
  SANDBOX_INIT_LEASE_RENEW_INTERVAL_MS,
  SANDBOX_INIT_LEASE_WAIT_TIMEOUT_MS,
  SANDBOX_INIT_LEASE_RETRY_INTERVAL_MS
} from '../../constants';

import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import {
  LeaseCache,
  RedisLeaseUnavailableError,
  isRedisLeaseError
} from '@fastgpt/dal/redis/caches';
import { getLogger, LogCategories } from '../../../../../common/logger';
import { getAgentSandboxCommonConfig } from '../../config';
import { createAgentSandboxInitializingError } from '../../error';
import type { SandboxPrepareContext, SandboxPrepareStep } from './prepare';
import { buildRuntimeHash } from '../../utils';
import {
  getRuntimeStateValue,
  readSandboxRuntimeState,
  setRuntimeStateValue,
  writeSandboxRuntimeState
} from './state';

const logger = getLogger(LogCategories.MODULE.AI.AGENT);
const leaseCache = new LeaseCache();

/**
 * 保护同一个 sandbox 的运行态初始化流程。
 *
 * 同一个 sandbox 内并发初始化时（如父 Agent 并发调用多个启用沙盒的子应用工具），
 * 如果文件部署、entrypoint 和扫描交错，可能互相污染。
 * 锁被占用时按重试间隔有界等待，超时或租约异常再转为标准 initializing 错误。
 * 锁只存在于服务端 Redis，不写入 sandbox 文件系统。
 */
export const withAgentSandboxInitLease = async <T>({
  sandboxId,
  waitTimeoutMs = SANDBOX_INIT_LEASE_WAIT_TIMEOUT_MS,
  retryIntervalMs = SANDBOX_INIT_LEASE_RETRY_INTERVAL_MS,
  fn
}: {
  sandboxId: string;
  waitTimeoutMs?: number;
  retryIntervalMs?: number;
  fn: () => Promise<T>;
}): Promise<T> => {
  const deadline = Date.now() + waitTimeoutMs;

  while (true) {
    let entered = false;
    try {
      return await leaseCache.withLease({
        key: `agent-sandbox:init:${sandboxId}`,
        label: 'agent-sandbox-init',
        ttlMs: SANDBOX_INIT_LEASE_TTL_MS,
        renewIntervalMs: SANDBOX_INIT_LEASE_RENEW_INTERVAL_MS,
        fn: async () => {
          entered = true;
          return await fn();
        }
      });
    } catch (error) {
      if (!entered && error instanceof RedisLeaseUnavailableError) {
        const remainingMs = deadline - Date.now();
        if (remainingMs > 0) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, Math.min(retryIntervalMs, remainingMs))
          );
          continue;
        }
      }
      if (isRedisLeaseError(error)) {
        throw createAgentSandboxInitializingError();
      }
      throw error;
    }
  }
};

/**
 * 执行 runtime sandbox entrypoint。
 *
 * 状态只写入 sandbox 用户 HOME，确保“是否执行过”跟具体 sandbox 实例绑定。
 * 脚本失败、超时或状态读写失败都不会阻断主流程。
 * scope 必须显式区分应用/节点，只读取该作用域下的成功标记。
 */
export const runAgentSandboxEntrypoint = async ({
  sandbox,
  sandboxEntrypoint,
  workDirectory,
  scope
}: {
  sandbox: ISandbox;
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

  setRuntimeStateValue(stateContext.state, stateKey, scriptHash);
  await writeSandboxRuntimeState(sandbox, stateContext);
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
  sandbox: ISandbox;
  command: string;
  label: string;
  workingDirectory?: string;
}): Promise<boolean> => {
  const timeoutSeconds = getEntrypointTimeoutSeconds();
  const result = await sandbox
    .execute(command, {
      timeoutMs: timeoutSeconds * 1000,
      maxOutputBytes: MAX_ENTRYPOINT_OUTPUT_BYTES,
      workingDirectory
    })
    .catch((error) => {
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

const getEntrypointTimeoutSeconds = (): number =>
  Math.min(Math.max(getAgentSandboxCommonConfig().entrypointTimeoutSeconds, 1), 600);

const truncateOutput = (value: string): string =>
  value.length > MAX_LOG_OUTPUT_LENGTH ? `${value.slice(0, MAX_LOG_OUTPUT_LENGTH)}...` : value;
