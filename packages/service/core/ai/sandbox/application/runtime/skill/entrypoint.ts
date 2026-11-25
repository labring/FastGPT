/**
 * 沙盒业务层：执行已部署 Skill 版本目录内的 entrypoint。
 *
 * 只维护 sandbox runtime state 中的执行标记，不创建版本或修改 Skill 数据。
 */
import type { OpenSandboxClient } from '../../../infrastructure/opensandbox/opensandbox';
import { isRecoverableSandboxError } from '../../../infrastructure/opensandbox/errors';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { getLogger, LogCategories } from '../../../../../../common/logger';
import type { DeployedSkillVersion } from './types';
import { buildLimitedOutputShellCommand, executeEntrypointCommand } from '../entrypoint';
import { joinSandboxPath } from '../../../utils';
import { SKILL_ENTRYPOINT_STATE_LIST_KEY } from '../../../constants';
import {
  getRuntimeStateValue,
  readSandboxRuntimeState,
  setRuntimeStateValue,
  writeSandboxRuntimeState
} from '../state';

const logger = getLogger(LogCategories.MODULE.AI.AGENT);

const ENTRYPOINT_FILE_NAME = 'entrypoint.sh';

/**
 * 执行 selected skill version 根目录下的 entrypoint。
 *
 * 状态写入容器临时层 `/var/lib/fastgpt-runtime/state.json`（只记录已成功执行的 `versionId`），
 * 不污染 `$HOME` 持久卷，容器重建后会随临时层自动重跑，保证容器根文件系统级依赖完备。
 */
export const runAgentSkillVersionEntrypoints = async ({
  sandbox,
  versions
}: {
  sandbox: OpenSandboxClient;
  versions: DeployedSkillVersion[];
}): Promise<void> => {
  if (versions.length === 0) return;

  const stateContext = await readSandboxRuntimeState({ sandbox });
  const stateValue = getRuntimeStateValue(stateContext.state, SKILL_ENTRYPOINT_STATE_LIST_KEY);
  // 未被当前节点选择的版本仍可能由父级或其他会话使用，成功标记随缓存一并保留。
  const executedVersionIds = new Set(Array.isArray(stateValue) ? stateValue : []);
  const pendingVersions = versions
    .filter((version) => !executedVersionIds.has(version.versionId))
    .map((version) => ({
      version,
      entrypointPath: joinSandboxPath(version.targetDir, ENTRYPOINT_FILE_NAME)
    }));
  if (pendingVersions.length === 0) return;

  const entrypointInfo = await sandbox
    .getFileInfo(pendingVersions.map(({ entrypointPath }) => entrypointPath))
    .catch((error) => {
      if (isRecoverableSandboxError(error)) throw error;
      logger.warn('[Agent Skills] Failed to check skill entrypoint files', {
        versionIds: pendingVersions.map(({ version }) => version.versionId),
        error
      });
      return new Map();
    });

  let stateDirty = false;
  try {
    for (const { version, entrypointPath } of pendingVersions) {
      if (executedVersionIds.has(version.versionId)) continue;
      if (!entrypointInfo.get(entrypointPath)?.isFile) continue;

      const result = await executeEntrypointCommand({
        sandbox,
        command: buildLimitedOutputShellCommand(`/bin/bash ${shellQuote(ENTRYPOINT_FILE_NAME)}`),
        label: `skill:${version.versionId}`,
        workingDirectory: version.targetDir
      });

      if (!result) continue;

      executedVersionIds.add(version.versionId);
      stateDirty = true;
    }
  } finally {
    if (stateDirty) {
      setRuntimeStateValue({
        state: stateContext.state,
        key: SKILL_ENTRYPOINT_STATE_LIST_KEY,
        value: [...executedVersionIds]
      });
      await writeSandboxRuntimeState({ sandbox, context: stateContext });
    }
  }
};
