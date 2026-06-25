import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { getLogger, LogCategories } from '../../../../common/logger';
import { serviceEnv } from '../../../../env';
import { isRedisLeaseError, withRedisLease } from '../../../../common/redis/lock';
import { createAgentSandboxInitializingError } from '../error';
import { buildRuntimeHash, shellQuote } from './utils';
import {
  getRuntimeStateHash,
  readSandboxRuntimeState,
  setRuntimeStateHash,
  writeSandboxRuntimeState
} from './state';

const logger = getLogger(LogCategories.MODULE.AI.AGENT);

export const SANDBOX_ENTRYPOINT_STATE_HASH_KEY = 'sandboxEntrypoint';
const MAX_LOG_OUTPUT_LENGTH = 4000;
export const MAX_ENTRYPOINT_OUTPUT_BYTES = 8 * 1024;
const SANDBOX_INIT_LEASE_TTL_MS = 3 * 60 * 1000;
const SANDBOX_INIT_LEASE_RENEW_INTERVAL_MS = SANDBOX_INIT_LEASE_TTL_MS / 6;

/**
 * 保护同一个 sandbox 的运行态初始化流程。
 *
 * 同一个 sandbox 内并发初始化时，如果文件部署、entrypoint 和扫描交错，可能互相污染。
 * 锁只存在于服务端 Redis，不写入 sandbox 文件系统。
 */
export const withAgentSandboxInitLease = async <T>({
  sandboxId,
  fn
}: {
  sandboxId: string;
  fn: () => Promise<T>;
}): Promise<T> => {
  return withRedisLease({
    key: `agent-sandbox:init:${sandboxId}`,
    label: 'agent-sandbox-init',
    ttlMs: SANDBOX_INIT_LEASE_TTL_MS,
    renewIntervalMs: SANDBOX_INIT_LEASE_RENEW_INTERVAL_MS,
    fn
  }).catch((error) => {
    if (isRedisLeaseError(error)) {
      throw createAgentSandboxInitializingError();
    }
    throw error;
  });
};

/**
 * 执行 runtime sandbox entrypoint。
 *
 * 状态只写入 sandbox 用户 HOME，确保“是否执行过”跟具体 sandbox 实例绑定。
 * 脚本失败、超时或状态读写失败都不会阻断主流程。
 */
export const runAgentSandboxEntrypoint = async ({
  sandbox,
  sandboxEntrypoint,
  workDirectory
}: {
  sandbox: ISandbox;
  sandboxEntrypoint?: string;
  workDirectory?: string;
}): Promise<void> => {
  const script = sandboxEntrypoint?.trim();
  if (!script) return;

  const stateContext = await readSandboxRuntimeState({ sandbox });
  const scriptHash = buildRuntimeHash(script);
  if (getRuntimeStateHash(stateContext.state, SANDBOX_ENTRYPOINT_STATE_HASH_KEY) === scriptHash) {
    return;
  }

  const command = buildBashScriptCommand(script, workDirectory);
  const result = await executeEntrypointCommand({
    sandbox,
    command,
    label: 'sandbox'
  });

  if (!result) return;

  setRuntimeStateHash(stateContext.state, SANDBOX_ENTRYPOINT_STATE_HASH_KEY, scriptHash);
  await writeSandboxRuntimeState(sandbox, stateContext);
};

export const executeEntrypointCommand = async ({
  sandbox,
  command,
  label
}: {
  sandbox: ISandbox;
  command: string;
  label: string;
}): Promise<boolean> => {
  const timeoutSeconds = getEntrypointTimeoutSeconds();
  const result = await sandbox
    .execute(command, {
      timeoutMs: timeoutSeconds * 1000,
      maxOutputBytes: MAX_ENTRYPOINT_OUTPUT_BYTES
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

const buildBashScriptCommand = (script: string, workDirectory?: string): string => {
  const encoded = Buffer.from(script, 'utf-8').toString('base64');
  const runScriptCommand = buildLimitedOutputShellCommand(
    `printf %s ${shellQuote(encoded)} | base64 -d | /bin/bash`
  );
  return workDirectory
    ? `cd ${shellQuote(workDirectory)} && ${runScriptCommand}`
    : runScriptCommand;
};

const getEntrypointTimeoutSeconds = (): number =>
  Math.min(Math.max(serviceEnv.AGENT_SANDBOX_ENTRYPOINT_TIMEOUT_SECONDS, 1), 600);

const truncateOutput = (value: string): string =>
  value.length > MAX_LOG_OUTPUT_LENGTH ? `${value.slice(0, MAX_LOG_OUTPUT_LENGTH)}...` : value;
