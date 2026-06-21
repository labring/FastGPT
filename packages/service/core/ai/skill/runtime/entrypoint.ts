import crypto from 'crypto';
import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { getLogger, LogCategories } from '../../../../common/logger';
import { serviceEnv } from '../../../../env';
import { joinSandboxPath, shellQuote } from '../utils';
import type { DeployedSkillVersion } from './types';

const logger = getLogger(LogCategories.MODULE.AI.AGENT);

const STATE_DIR_RELATIVE_PATH = '.fastgpt/agent-skill-entrypoints';
const STATE_FILE_NAME = 'state.json';
const LOCK_DIR_NAME = '.lock';
const RUNTIME_LOCK_DIR_NAME = '.runtime.lock';
const ENTRYPOINT_FILE_NAME = 'entrypoint.sh';
const MAX_LOG_OUTPUT_LENGTH = 4000;
const MAX_ENTRYPOINT_OUTPUT_BYTES = 8 * 1024;
const LOCK_STALE_SECONDS = 15 * 60;
const LOCK_WAIT_SECONDS = 10 * 60;

type EntrypointState = {
  sandboxEntrypointHashes?: string[];
  skillEntrypoints?: string[];
};

type EntrypointStateContext = {
  stateDir?: string;
  statePath?: string;
  state: EntrypointState;
};

type EntrypointStateLocation = Omit<EntrypointStateContext, 'state'>;

/**
 * 保护普通运行态 skill 目录 reconcile、entrypoint 和 SKILL.md scan。
 *
 * 同一个 sandbox 内并发选择不同 skill 时，如果 cleanup 与 scan 交错，可能删除
 * 另一轮正在使用的版本目录。这个锁只绑定 sandbox HOME，不进入 DB。
 */
export const withAgentSkillRuntimeLock = async <T>({
  sandbox,
  fn
}: {
  sandbox: ISandbox;
  fn: () => Promise<T>;
}): Promise<T> => {
  const location = await resolveEntrypointStateLocation(sandbox);
  return withSandboxDirLock({
    sandbox,
    stateDir: location.stateDir,
    lockName: RUNTIME_LOCK_DIR_NAME,
    label: 'runtime',
    fn
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

  const stateLocation = await resolveEntrypointStateLocation(sandbox);
  await withEntrypointStateLock(sandbox, stateLocation, async () => {
    const lockedStateContext = await readEntrypointState(sandbox, stateLocation);
    const state = lockedStateContext.state;

    const scriptHash = hashContent(script);
    const executedSandboxEntrypoints = new Set(state.sandboxEntrypointHashes || []);
    if (executedSandboxEntrypoints.has(scriptHash)) return;

    const command = buildBashScriptCommand(script, workDirectory);
    const result = await executeEntrypointCommand({
      sandbox,
      command,
      label: 'sandbox'
    });

    if (!result) return;

    executedSandboxEntrypoints.add(scriptHash);
    lockedStateContext.state.sandboxEntrypointHashes = Array.from(executedSandboxEntrypoints);
    await writeEntrypointState(sandbox, lockedStateContext);
  });
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
  await withEntrypointStateLock(sandbox, stateLocation, async () => {
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
    const clearFreshDeployState = async (versionId: string) => {
      if (!executedVersionIds.delete(versionId)) return;

      // fresh deploy 没有成功执行入口时不能保留旧成功状态，否则下轮可能误跳过。
      await writeSkillEntrypointState();
    };

    for (const version of versions) {
      if (!version.freshlyDeployed && executedVersionIds.has(version.versionId)) continue;

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
      if (!existsResult || existsResult.exitCode !== 0) {
        if (version.freshlyDeployed) {
          await clearFreshDeployState(version.versionId);
        }
        continue;
      }

      const result = await executeEntrypointCommand({
        sandbox,
        command: `cd ${shellQuote(version.targetDir)} && ${buildLimitedOutputShellCommand(
          `/bin/bash ${shellQuote(ENTRYPOINT_FILE_NAME)}`
        )}`,
        label: `skill:${version.versionId}`
      });

      if (!result) {
        if (version.freshlyDeployed) {
          await clearFreshDeployState(version.versionId);
        }
        continue;
      }

      executedVersionIds.add(version.versionId);
      await writeSkillEntrypointState();
    }

    if (stateDirty) {
      await writeSkillEntrypointState();
    }
  });
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

const withEntrypointStateLock = async (
  sandbox: ISandbox,
  stateLocation: EntrypointStateLocation,
  fn: () => Promise<void>
): Promise<void> => {
  await withSandboxDirLock({
    sandbox,
    stateDir: stateLocation.stateDir,
    lockName: LOCK_DIR_NAME,
    label: 'entrypoint-state',
    fn
  });
};

const withSandboxDirLock = async <T>({
  sandbox,
  stateDir,
  lockName,
  label,
  fn
}: {
  sandbox: ISandbox;
  stateDir?: string;
  lockName: string;
  label: string;
  fn: () => Promise<T>;
}): Promise<T> => {
  if (!stateDir) {
    return fn();
  }

  const lockDir = joinSandboxPath(stateDir, lockName);
  const ownerToken = crypto.randomUUID();
  const lockResult = await sandbox
    .execute(buildAcquireLockCommand({ lockDir, ownerToken }), {
      timeoutMs: (LOCK_WAIT_SECONDS + 10) * 1000,
      maxOutputBytes: 1024
    })
    .catch((error) => {
      logger.warn('[Agent Skills] Failed to acquire sandbox lock', {
        label,
        lockDir,
        error
      });
      return undefined;
    });

  if (!lockResult || lockResult.exitCode !== 0) {
    logger.warn('[Agent Skills] Sandbox lock unavailable after waiting, run without lock', {
      label,
      lockDir,
      stderr: lockResult?.stderr
    });
    return fn();
  }

  try {
    return await fn();
  } finally {
    await sandbox.execute(buildReleaseLockCommand({ lockDir, ownerToken })).catch((error) => {
      logger.warn('[Agent Skills] Failed to release sandbox lock', {
        label,
        lockDir,
        error
      });
    });
  }
};

const buildAcquireLockCommand = ({
  lockDir,
  ownerToken
}: {
  lockDir: string;
  ownerToken: string;
}) =>
  `/bin/bash -c ${shellQuote(`
lock_dir=${shellQuote(lockDir)}
owner_token=${shellQuote(ownerToken)}
deadline=$(( $(date +%s) + ${LOCK_WAIT_SECONDS} ))
while true; do
  if mkdir "$lock_dir" 2>/dev/null; then
    printf %s "$owner_token" > "$lock_dir/owner"
    exit 0
  fi

  now=$(date +%s)
  lock_mtime=$(stat -c %Y "$lock_dir" 2>/dev/null || stat -f %m "$lock_dir" 2>/dev/null || printf %s "$now")
  if [ $(( now - lock_mtime )) -ge ${LOCK_STALE_SECONDS} ]; then
    rm -rf "$lock_dir"
    continue
  fi

  if [ "$now" -ge "$deadline" ]; then
    exit 1
  fi
  sleep 1
done
`)}`;

const buildReleaseLockCommand = ({
  lockDir,
  ownerToken
}: {
  lockDir: string;
  ownerToken: string;
}) =>
  `/bin/bash -c ${shellQuote(`
lock_dir=${shellQuote(lockDir)}
owner_token=${shellQuote(ownerToken)}
if [ -f "$lock_dir/owner" ] && [ "$(cat "$lock_dir/owner" 2>/dev/null)" = "$owner_token" ]; then
  rm -rf "$lock_dir"
fi
`)}`;

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
            ...((state.sandboxEntrypointHashes || []).length > 0
              ? { sandboxEntrypointHashes: Array.from(new Set(state.sandboxEntrypointHashes)) }
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
    ...(Array.isArray(raw.sandboxEntrypointHashes)
      ? {
          sandboxEntrypointHashes: raw.sandboxEntrypointHashes.filter(
            (item) => typeof item === 'string'
          )
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
