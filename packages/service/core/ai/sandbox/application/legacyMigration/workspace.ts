/** Legacy migration 的目标 Sandbox 创建和 Workspace 无覆盖安装。 */
import { createHash } from 'node:crypto';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { buildRuntimeSandboxAdapter } from '../../infrastructure/provider/adapter';
import { ensureConnectedSandboxRunning } from '../../infrastructure/provider/lifecycle';
import { getSandboxRuntimeProfile } from '../../infrastructure/provider/runtimeProfile';
import { getSessionVolumeConfig } from '../../infrastructure/volume/service';
import type { LegacySandboxInstanceSchemaType } from '../../infrastructure/instance/legacySchema';
import { SandboxMetadataSchema, type SandboxProviderType } from '../../type';
import { getSandboxRuntimePaths, getSandboxSessionPathSegment, joinSandboxPath } from '../../utils';
import { restoreSandboxWorkspaceArchiveForMigration } from '../archive';
import type { LegacyMigrationTarget } from './types';
import { toV2Metadata } from './utils';

const LEGACY_SKILL_VERSION_DIRECTORY_NAME_LENGTH = 24;
const MIGRATION_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

/** migration 创建新物理资源时，把当前 Provider runtime image 写入 v2 metadata。 */
export const getMigrationTargetMetadata = (
  metadata: LegacySandboxInstanceSchemaType['metadata'],
  provider: SandboxProviderType
) => {
  const stableMetadata = toV2Metadata(metadata);
  const image = getSandboxRuntimeProfile(provider).defaultImage;
  return SandboxMetadataSchema.parse({
    ...stableMetadata,
    ...(image ? { image } : {})
  });
};

/** 创建 migration 专用 target，不经过可能触发其他业务恢复分支的普通 runtime client。 */
export const createMigrationTarget = async (params: {
  provider: SandboxProviderType;
  sandboxId: string;
  sourceType: ChatSourceTypeEnum.app | ChatSourceTypeEnum.skillEdit;
  chatId?: string;
  limit?: LegacySandboxInstanceSchemaType['limit'];
}): Promise<LegacyMigrationTarget> => {
  const vmConfig =
    params.provider === 'opensandbox' ? await getSessionVolumeConfig(params.sandboxId) : undefined;
  const provider = buildRuntimeSandboxAdapter(params.provider, params.sandboxId, {
    vmConfig,
    resourceLimits: params.limit
  });
  await ensureConnectedSandboxRunning(provider);
  const runtimePaths = getSandboxRuntimePaths({
    sourceType: params.sourceType,
    workDirectory: getSandboxRuntimeProfile(params.provider).workDirectory,
    chatId: params.chatId
  });
  return {
    provider,
    getRuntimePaths: () => runtimePaths,
    storage: vmConfig?.storage
  };
};

/**
 * 把 Legacy Workspace 从 staging 合并到目标目录。
 *
 * 目标现有文件始终优先；Legacy 只补充缺失文件，避免升级后产生的新内容被旧归档覆盖。
 */
async function mergeLegacyWorkspaceArchive(params: {
  target: LegacyMigrationTarget;
  legacySandboxId: string;
  archiveBody: Buffer;
  targetDirectory: string;
  removeAppRuntimeSkillCaches: boolean;
}) {
  const { target, legacySandboxId, archiveBody, targetDirectory } = params;
  const { workspaceRoot } = target.getRuntimePaths();
  const stagingName = createHash('sha256').update(legacySandboxId).digest('hex').slice(0, 40);
  const stagingDirectory = joinSandboxPath(
    joinSandboxPath(workspaceRoot, '.migration'),
    stagingName
  );
  await restoreSandboxWorkspaceArchiveForMigration({
    sandbox: target.provider,
    workDirectory: stagingDirectory,
    sandboxId: legacySandboxId,
    archiveBody
  });

  const removeRuntimeSkillCacheCommands = params.removeAppRuntimeSkillCaches
    ? [
        'projects="$source/projects"',
        'if [ -d "$projects" ]; then',
        '  find "$projects" -mindepth 1 -maxdepth 1 -type d -exec sh -c \'',
        '    for dir; do',
        '      name=${dir##*/}',
        '      case "$name" in ""|*[!0-9a-fA-F]*) continue ;; esac',
        `      [ "\${#name}" -eq ${LEGACY_SKILL_VERSION_DIRECTORY_NAME_LENGTH} ] && rm -rf -- "$dir"`,
        '    done',
        "  ' sh {} +",
        'fi'
      ]
    : [];
  const result = await target.provider.execute(
    [
      'set -e',
      `source=${shellQuote(stagingDirectory)}`,
      `target=${shellQuote(targetDirectory)}`,
      ...removeRuntimeSkillCacheCommands,
      'merge_without_overwrite() {',
      '  source_root=$1; target_root=$2',
      '  for source_path in "$source_root"/* "$source_root"/.[!.]* "$source_root"/..?*; do',
      '    [ -e "$source_path" ] || [ -L "$source_path" ] || continue',
      '    name=${source_path##*/}; target_path="$target_root/$name"',
      '    if [ ! -e "$target_path" ] && [ ! -L "$target_path" ]; then',
      '      mv -- "$source_path" "$target_path"',
      '    elif [ -d "$source_path" ] && [ ! -L "$source_path" ] && [ -d "$target_path" ] && [ ! -L "$target_path" ]; then',
      '      merge_without_overwrite "$source_path" "$target_path"',
      '    fi',
      '  done',
      '}',
      'if [ -d "$target" ]; then',
      '  merge_without_overwrite "$source" "$target"; rm -rf -- "$source"; exit 0',
      'fi',
      'if [ -e "$target" ]; then echo "Migration target exists but is not a directory" >&2; exit 1; fi',
      'mkdir -p "$(dirname "$target")"',
      'mv -- "$source" "$target"',
      'test -d "$target"'
    ].join('\n'),
    { timeoutMs: MIGRATION_COMMAND_TIMEOUT_MS, maxOutputBytes: 8 * 1024 }
  );
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || 'Failed to commit workspace');
  }
}

/** 把一条旧 App Workspace 归档幂等安装到目标 Chat session。 */
export const installLegacyWorkspaceArchive = (params: {
  target: LegacyMigrationTarget;
  legacySandboxId: string;
  chatId: string;
  archiveBody: Buffer;
}) => {
  const { workspaceRoot } = params.target.getRuntimePaths();
  return mergeLegacyWorkspaceArchive({
    target: params.target,
    legacySandboxId: params.legacySandboxId,
    archiveBody: params.archiveBody,
    targetDirectory: joinSandboxPath(
      joinSandboxPath(workspaceRoot, 'sessions'),
      getSandboxSessionPathSegment(params.chatId)
    ),
    removeAppRuntimeSkillCaches: true
  });
};

/** 把旧 Skill Workspace 合并到编辑目标，保留升级后已经产生的文件。 */
export const installLegacySkillWorkspaceArchive = (params: {
  target: LegacyMigrationTarget;
  legacySandboxId: string;
  archiveBody: Buffer;
}) =>
  mergeLegacyWorkspaceArchive({
    ...params,
    targetDirectory: params.target.getRuntimePaths().workspaceRoot,
    removeAppRuntimeSkillCaches: false
  });
