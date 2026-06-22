import crypto from 'crypto';
import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { getLogger, LogCategories } from '../../../../common/logger';
import { serviceEnv } from '../../../../env';
import { joinSandboxPath, shellQuote } from '../utils';
import type { DeployedSkillVersion } from './types';
import { isRedisLeaseError, withRedisLease } from '../../../../common/redis/lock';
import { createAgentSandboxInitializingError } from '../../sandbox/error';

const logger = getLogger(LogCategories.MODULE.AI.AGENT);

const STATE_DIR_RELATIVE_PATH = '.fastgpt/agent-skill-entrypoints';
const STATE_FILE_NAME = 'state.json';
const ENTRYPOINT_FILE_NAME = 'entrypoint.sh';
const MAX_LOG_OUTPUT_LENGTH = 4000;
const MAX_ENTRYPOINT_OUTPUT_BYTES = 8 * 1024;
const SANDBOX_INIT_LEASE_TTL_MS = 3 * 60 * 1000;
const SANDBOX_INIT_LEASE_RENEW_INTERVAL_MS = SANDBOX_INIT_LEASE_TTL_MS / 6;

type EntrypointState = {
  sandboxEntrypointHash?: string;
  skillEntrypoints?: string[];
};

type EntrypointStateContext = {
  stateDir?: string;
  statePath?: string;
  state: EntrypointState;
};

type EntrypointStateLocation = Omit<EntrypointStateContext, 'state'>;

/**
 * 保护同一个 sandbox 的运行态初始化流程。
 *
 * 同一个 sandbox 内并发选择不同 skill 时，如果 cleanup 与 scan 交错，可能删除
 * 另一轮正在使用的版本目录。锁只存在于服务端 Redis，不写入 sandbox 文件系统。
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
  afterSandboxEntrypoint,
  workDirectory
}: {
  sandbox: ISandbox;
  sandboxEntrypoint?: string;
  afterSandboxEntrypoint?: string;
  workDirectory?: string;
}): Promise<void> => {
  const script = sandboxEntrypoint?.trim();
  if (!script) return;

  const stateLocation = await resolveEntrypointStateLocation(sandbox);
  const stateContext = await readEntrypointState(sandbox, stateLocation);
  const state = stateContext.state;

  const scriptHash = hashContent(script);
  if (state.sandboxEntrypointHash === scriptHash) return;

  const command = buildBashScriptCommand(script, workDirectory);
  const result = await executeEntrypointCommand({
    sandbox,
    command,
    label: 'sandbox'
  });

  if (!result) return;

  const afterScript = afterSandboxEntrypoint?.trim();
  if (afterScript) {
    const afterResult = await executeEntrypointCommand({
      sandbox,
      command: buildBashScriptCommand(afterScript, workDirectory),
      label: 'sandbox:after'
    });

    if (!afterResult) return;
  }

  stateContext.state.sandboxEntrypointHash = scriptHash;
  await writeEntrypointState(sandbox, stateContext);
};

/**
 * 执行 selected skill version 根目录下的 entrypoint。
 *
 * skill 版本包以 versionId 作为部署目录，同一个 versionId 的内容正常不可变，
 * 因此成功状态只记录 versionId，不再记录脚本 hash。
 */
export const runAgentSkillVersionEntrypoints = async ({
  sandbox,
  versions
}: {
  sandbox: ISandbox;
  versions: DeployedSkillVersion[];
}): Promise<void> => {
  if (versions.length === 0) return;

  const stateLocation = await resolveEntrypointStateLocation(sandbox);
  const stateContext = await readEntrypointState(sandbox, stateLocation);
  const state = stateContext.state;

  const originalSkillEntrypoints = state.skillEntrypoints || [];
  const selectedVersionIds = new Set(versions.map(({ versionId }) => versionId));
  const executedVersionIds = new Set(
    originalSkillEntrypoints.filter((versionId) => selectedVersionIds.has(versionId))
  );
  let stateDirty = originalSkillEntrypoints.length !== executedVersionIds.size;
  const writeSkillEntrypointState = async () => {
    stateContext.state.skillEntrypoints = Array.from(executedVersionIds);
    await writeEntrypointState(sandbox, stateContext);
    stateDirty = false;
  };

  for (const version of versions) {
    if (executedVersionIds.has(version.versionId)) continue;

    const entrypointPath = joinSandboxPath(version.targetDir, ENTRYPOINT_FILE_NAME);
    const existsResult = await sandbox
      .execute(`[ -f ${shellQuote(entrypointPath)} ]`, {
        timeoutMs: 5_000,
        maxOutputBytes: 1024
      })
      .catch((error) => {
        logger.warn('[Agent Skills] Failed to check skill entrypoint file', {
          versionId: version.versionId,
          entrypointPath,
          error
        });
        return undefined;
      });
    if (!existsResult || existsResult.exitCode !== 0) continue;

    const result = await executeEntrypointCommand({
      sandbox,
      command: `cd ${shellQuote(version.targetDir)} && ${buildLimitedOutputShellCommand(
        `/bin/bash ${shellQuote(ENTRYPOINT_FILE_NAME)}`
      )}`,
      label: `skill:${version.versionId}`
    });

    if (!result) continue;

    executedVersionIds.add(version.versionId);
    await writeSkillEntrypointState();
  }

  if (stateDirty) {
    await writeSkillEntrypointState();
  }
};

const resolveEntrypointStateLocation = async (
  sandbox: ISandbox
): Promise<EntrypointStateLocation> => {
  const homeDir = await resolveSandboxHome(sandbox);
  if (!homeDir) {
    return {};
  }

  const stateDir = joinSandboxPath(homeDir, STATE_DIR_RELATIVE_PATH);
  const statePath = joinSandboxPath(stateDir, STATE_FILE_NAME);

  const prepareResult = await sandbox
    .execute(`mkdir -p ${shellQuote(stateDir)}`, {
      timeoutMs: 5_000,
      maxOutputBytes: 1024
    })
    .catch((error) => {
      logger.warn('[Agent Skills] Failed to prepare entrypoint state directory', {
        stateDir,
        error
      });
      return undefined;
    });
  if (!prepareResult || prepareResult.exitCode !== 0) {
    return {};
  }

  return {
    stateDir,
    statePath
  };
};

const readEntrypointState = async (
  sandbox: ISandbox,
  location?: EntrypointStateLocation
): Promise<EntrypointStateContext> => {
  const stateLocation = location || (await resolveEntrypointStateLocation(sandbox));
  const { stateDir, statePath } = stateLocation;
  if (!statePath) {
    return {
      state: {}
    };
  }

  const [stateFile] = await sandbox.readFiles([statePath]).catch((error) => {
    logger.warn('[Agent Skills] Failed to read entrypoint state file', {
      statePath,
      error
    });
    return [];
  });

  if (!stateFile || stateFile.error) {
    return {
      stateDir,
      statePath,
      state: {}
    };
  }

  try {
    const content = Buffer.from(stateFile.content).toString('utf-8');
    if (!content.trim()) {
      return {
        stateDir,
        statePath,
        state: {}
      };
    }

    const parsed = JSON.parse(content);
    return {
      stateDir,
      statePath,
      state: normalizeEntrypointState(parsed)
    };
  } catch (error) {
    logger.warn('[Agent Skills] Failed to parse entrypoint state file', {
      statePath,
      error
    });
    return {
      stateDir,
      statePath,
      state: {}
    };
  }
};

const writeEntrypointState = async (
  sandbox: ISandbox,
  { statePath, state }: EntrypointStateContext
): Promise<void> => {
  if (!statePath) return;

  const writeResult = await sandbox
    .writeFiles([
      {
        path: statePath,
        data: JSON.stringify(
          {
            ...(state.sandboxEntrypointHash
              ? { sandboxEntrypointHash: state.sandboxEntrypointHash }
              : {}),
            ...((state.skillEntrypoints || []).length > 0
              ? { skillEntrypoints: Array.from(new Set(state.skillEntrypoints)) }
              : {})
          },
          null,
          2
        )
      }
    ])
    .catch((error) => {
      logger.warn('[Agent Skills] Failed to write entrypoint state file', {
        statePath,
        error
      });
      return [];
    });

  const failed = writeResult.find((item) => item.error);
  if (failed) {
    logger.warn('[Agent Skills] Failed to write entrypoint state file', {
      statePath,
      error: failed.error
    });
  }
};

const resolveSandboxHome = async (sandbox: ISandbox): Promise<string | undefined> => {
  const homeResult = await sandbox
    .execute('printf "%s" "$HOME"', {
      timeoutMs: 5_000,
      maxOutputBytes: 1024
    })
    .catch(() => undefined);

  const homeFromEnv = homeResult?.exitCode === 0 ? homeResult.stdout.trim() : '';
  if (homeFromEnv) return homeFromEnv;

  const fallbackResult = await sandbox
    .execute('sh -c "echo ~"', {
      timeoutMs: 5_000,
      maxOutputBytes: 1024
    })
    .catch((error) => {
      logger.warn('[Agent Skills] Failed to resolve sandbox HOME', { error });
      return undefined;
    });

  const fallbackHome = fallbackResult?.exitCode === 0 ? fallbackResult.stdout.trim() : '';
  if (fallbackHome) return fallbackHome;

  logger.warn('[Agent Skills] Failed to resolve sandbox HOME');
};

const executeEntrypointCommand = async ({
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

const normalizeEntrypointState = (value: unknown): EntrypointState => {
  if (!value || typeof value !== 'object') return {};
  const raw = value as EntrypointState;

  return {
    ...(typeof raw.sandboxEntrypointHash === 'string'
      ? {
          sandboxEntrypointHash: raw.sandboxEntrypointHash
        }
      : {}),
    ...(Array.isArray(raw.skillEntrypoints)
      ? { skillEntrypoints: raw.skillEntrypoints.filter((item) => typeof item === 'string') }
      : {})
  };
};

const hashContent = (content: string): string =>
  `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;

const buildBashScriptCommand = (script: string, workDirectory?: string): string => {
  const encoded = Buffer.from(script, 'utf-8').toString('base64');
  const runScriptCommand = buildLimitedOutputShellCommand(
    `printf %s ${shellQuote(encoded)} | base64 -d | /bin/bash`
  );
  return workDirectory
    ? `cd ${shellQuote(workDirectory)} && ${runScriptCommand}`
    : runScriptCommand;
};

const buildLimitedOutputShellCommand = (scriptCommand: string): string =>
  `/bin/bash -c ${shellQuote(
    `${scriptCommand} > >(tail -c ${MAX_ENTRYPOINT_OUTPUT_BYTES}) 2> >(tail -c ${MAX_ENTRYPOINT_OUTPUT_BYTES} >&2)`
  )}`;

const getEntrypointTimeoutSeconds = (): number =>
  Math.min(Math.max(serviceEnv.AGENT_SANDBOX_ENTRYPOINT_TIMEOUT_SECONDS, 1), 600);

const truncateOutput = (value: string): string =>
  value.length > MAX_LOG_OUTPUT_LENGTH ? `${value.slice(0, MAX_LOG_OUTPUT_LENGTH)}...` : value;
