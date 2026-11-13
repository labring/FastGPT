/**
 * 沙盒业务层：执行已部署 Skill 版本目录内的 entrypoint。
 *
 * 只维护 sandbox runtime state 中的执行标记，不创建版本或修改 Skill 数据。
 */
import { OPEN_SANDBOX_DEFAULT_ROOT_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import type { OpenSandboxClient } from '../../../infrastructure/opensandbox/opensandbox';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { getLogger, LogCategories } from '../../../../../../common/logger';
import type { DeployedSkillVersion } from './types';
import { executeEntrypointCommand } from '../entrypoint';
import { joinSandboxPath } from '../../../utils';
import { SKILL_ENTRYPOINT_STATE_LIST_KEY } from '../../../constants';
import {
  getRuntimeStateValue,
  readSandboxWorkspaceRuntimeState,
  setRuntimeStateValue,
  writeSandboxRuntimeState
} from '../state';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

const ENTRYPOINT_FILE_NAME = 'entrypoint.sh';

/**
 * 执行 selected skill version 根目录下的 entrypoint。
 *
 * skill 版本包与用户态依赖都落在持久化 `/workspace` 卷上，因此成功标记写入
 * 工作区级 `.fastgpt/runtime/state.json` 并绑定容器镜像标识，避免容器休眠唤醒后重复执行。
 */
export const runAgentSkillVersionEntrypoints = async ({
  sandbox,
  versions,
  workspaceDirectory = OPEN_SANDBOX_DEFAULT_ROOT_PATH
}: {
  sandbox: OpenSandboxClient;
  versions: DeployedSkillVersion[];
  workspaceDirectory?: string;
}): Promise<void> => {
  if (versions.length === 0) return;

  const stateContext = await readSandboxWorkspaceRuntimeState({
    sandbox,
    workspaceDirectory
  });
  const stateValue = getRuntimeStateValue(stateContext.state, SKILL_ENTRYPOINT_STATE_LIST_KEY);
  // 未被当前节点选择的版本仍可能由父级或其他会话使用，成功标记随缓存一并保留。
  const executedVersionIds = new Set(Array.isArray(stateValue) ? stateValue : []);

  for (const version of versions) {
    if (executedVersionIds.has(version.versionId)) continue;

    const entrypointPath = joinSandboxPath(version.targetDir, ENTRYPOINT_FILE_NAME);
    const entrypointInfo = await sandbox.getFileInfo([entrypointPath]).catch((error) => {
      logger.warn('[Agent Skills] Failed to check skill entrypoint file', {
        versionId: version.versionId,
        entrypointPath,
        error
      });
      return new Map();
    });
    if (entrypointInfo.get(entrypointPath)?.type !== 'file') continue;

    const result = await executeEntrypointCommand({
      sandbox,
      command: `/bin/bash ${shellQuote(ENTRYPOINT_FILE_NAME)}`,
      label: `skill:${version.versionId}`,
      workingDirectory: version.targetDir
    });

    if (!result) continue;

    executedVersionIds.add(version.versionId);
    setRuntimeStateValue(stateContext.state, SKILL_ENTRYPOINT_STATE_LIST_KEY, [
      ...executedVersionIds
    ]);
    await writeSandboxRuntimeState(sandbox, stateContext);
  }
};
