import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { getLogger, LogCategories } from '../../../../common/logger';
import type { DeployedSkillVersion } from './types';
import {
  buildLimitedOutputShellCommand,
  executeEntrypointCommand
} from '../../sandbox/runtime/entrypoint';
import { joinSandboxPath, shellQuote } from '../../sandbox/runtime/utils';
import {
  getRuntimeStateValue,
  readSandboxRuntimeState,
  setRuntimeStateValue,
  writeSandboxRuntimeState
} from '../../sandbox/runtime/state';

const logger = getLogger(LogCategories.MODULE.AI.AGENT);

const ENTRYPOINT_FILE_NAME = 'entrypoint.sh';
const SKILL_ENTRYPOINT_STATE_LIST_KEY = 'skillEntrypoints';

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

  const stateContext = await readSandboxRuntimeState({ sandbox });
  const state = stateContext.state;

  const stateValue = getRuntimeStateValue(state, SKILL_ENTRYPOINT_STATE_LIST_KEY);
  const originalSkillEntrypoints = Array.isArray(stateValue) ? stateValue : [];
  const selectedVersionIds = new Set(versions.map(({ versionId }) => versionId));
  const executedVersionIds = new Set(
    originalSkillEntrypoints.filter((versionId) => selectedVersionIds.has(versionId))
  );
  let stateDirty = originalSkillEntrypoints.length !== executedVersionIds.size;
  const writeSkillEntrypointState = async () => {
    setRuntimeStateValue(stateContext.state, SKILL_ENTRYPOINT_STATE_LIST_KEY, [
      ...executedVersionIds
    ]);
    await writeSandboxRuntimeState(sandbox, stateContext);
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
