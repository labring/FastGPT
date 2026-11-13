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

import { OPEN_SANDBOX_DEFAULT_ROOT_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import type { OpenSandboxClient } from '../../infrastructure/opensandbox/opensandbox';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { isRedisLeaseError } from '@fastgpt/dal/redis/caches';
import { getLogger, LogCategories } from '../../../../../common/logger';
import { serviceEnv } from '../../../../../env';
import { createAgentSandboxInitializingError } from '../../error';
import { acquireSandboxRedisLease } from '../lease';
import type { SandboxPrepareContext, SandboxPrepareStep } from './prepare';
import { buildRuntimeHash } from '../../utils';
import {
  getRuntimeStateValue,
  readSandboxWorkspaceRuntimeState,
  setRuntimeStateValue,
  writeSandboxRuntimeState
} from './state';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

/**
 * 保护同一个 sandbox 的运行态内容初始化流程（App/ToolCall 与 Skill Edit 共用）。
 *
 * 同一个 sandbox 内并发初始化时（如父 Agent 并发调用多个启用沙盒的子应用工具，或重复打开技能编辑页），
 * 如果文件部署、清空目录、entrypoint 和扫描交错，可能互相污染。
 * 锁采用短 TTL（30s）+ 自动续租（5s），被占用时按重试间隔有界等待，超时或租约异常再转为标准 initializing 错误。
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
  try {
    return await acquireSandboxRedisLease({
      key: `agent-sandbox:init:${sandboxId}`,
      label: 'agent-sandbox-init',
      ttlMs: SANDBOX_INIT_LEASE_TTL_MS,
      renewIntervalMs: SANDBOX_INIT_LEASE_RENEW_INTERVAL_MS,
      waitTimeoutMs,
      retryIntervalMs,
      fn: async () => await fn()
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
 * 状态写入持久化工作区 `.fastgpt/runtime/state.json` 并绑定容器镜像标识，
 * 确保容器空闲回收后再次唤醒时无需重复执行未变更脚本，而底层镜像升级后会自动失效重跑。
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

  const stateContext = await readSandboxWorkspaceRuntimeState({
    sandbox,
    workspaceDirectory: workDirectory ?? OPEN_SANDBOX_DEFAULT_ROOT_PATH
  });
  const stateKey = `${SANDBOX_ENTRYPOINT_STATE_HASH_KEY}:${scope}`;
  const scriptHash = buildRuntimeHash(script);
  if (getRuntimeStateValue(stateContext.state, stateKey) === scriptHash) {
    return;
  }

  const encoded = Buffer.from(script, 'utf-8').toString('base64');
  const command = `printf %s ${shellQuote(encoded)} | base64 -d | /bin/bash`;
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

/**
 * 在 sandbox 内执行 entrypoint 命令并记录结构化日志。
 *
 * 超时时间限制在 `[1, 600]` 秒区间，输出截断至 `MAX_ENTRYPOINT_OUTPUT_BYTES`；
 * 任何非 0 退出码或命令异常均返回 `false`，不向调用方抛错阻断会话初始化。
 */
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
  const timeoutSeconds = Math.min(
    Math.max(serviceEnv.AGENT_SANDBOX_ENTRYPOINT_TIMEOUT_SECONDS, 1),
    600
  );
  const truncateOutput = (value: string): string =>
    value.length > MAX_LOG_OUTPUT_LENGTH ? `${value.slice(0, MAX_LOG_OUTPUT_LENGTH)}...` : value;

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
