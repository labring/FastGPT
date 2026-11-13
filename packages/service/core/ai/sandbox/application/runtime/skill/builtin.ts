/**
 * 沙盒业务层：同步内置 Skill 文件到运行态 sandbox。
 *
 * 只管理 sandbox HOME 下的内置 Skill 目录，不进入用户 workspace 或发布包。
 */
import type { WriteEntry } from '@alibaba-group/opensandbox';
import { OPEN_SANDBOX_DEFAULT_HOME_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import type { OpenSandboxClient } from '../../../infrastructure/opensandbox/opensandbox';
import type {
  BuiltinSkillSource,
  BuiltinSkillSourceFile
} from '@fastgpt/global/core/ai/skill/runtime/builtin';
import { buildRuntimeHash, joinSandboxPath } from '../../../utils';
import {
  getRuntimeStateValue,
  readSandboxRuntimeState,
  setRuntimeStateValue,
  writeSandboxRuntimeState
} from '../state';
import { prepareSandboxFileParentDirectories } from '../../file';

const BUILTIN_SKILL_STATE_HASH_PREFIX = 'builtinSkill:';

type BuiltinSkillSyncSource = BuiltinSkillSource & {
  files: BuiltinSkillSourceFile[];
  etag: string;
};

/** 内置 Skill 注入到 sandbox 用户主目录，不属于用户可编辑 workspace。 */
export function getBuiltinSkillsRootPath(homeDirectory: string): string {
  return joinSandboxPath(homeDirectory, '.fastgpt', 'skills');
}

/**
 * 将内置 Skill 源码注入 sandbox 用户主目录。
 *
 * 目标路径位于 `<homeDirectory>/.fastgpt/skills/<name>`，不在用户 workspace
 * 内，因此不会进入编辑器文件树、导出包或发布包。
 */
export async function syncBuiltinSkillsToSandbox({
  sandbox,
  homeDirectory = OPEN_SANDBOX_DEFAULT_HOME_PATH,
  sources
}: {
  sandbox: OpenSandboxClient;
  homeDirectory?: string;
  sources: BuiltinSkillSource[];
}): Promise<void> {
  const syncSources = sources.map(buildBuiltinSkillSyncSource);
  if (syncSources.length === 0) return;

  const builtinSkillsRootPath = getBuiltinSkillsRootPath(homeDirectory);
  const runtimeStateContext = await readSandboxRuntimeState({ sandbox, homeDirectory });
  const pendingSources = syncSources.filter(
    (source) =>
      getRuntimeStateValue(runtimeStateContext.state, getBuiltinSkillStateHashKey(source.name)) !==
      source.etag
  );
  if (pendingSources.length === 0) return;

  await sandbox.createDirectories([builtinSkillsRootPath]);
  const existingEntries = await sandbox.listDirectory(builtinSkillsRootPath);
  const existingEntryByPath = new Map(existingEntries.map((entry) => [entry.path, entry]));

  for (const source of pendingSources) {
    const targetDirectory = joinSandboxPath(builtinSkillsRootPath, source.name);
    const stateKey = getBuiltinSkillStateHashKey(source.name);
    const existingEntry = existingEntryByPath.get(targetDirectory);
    if (existingEntry?.type === 'directory') {
      await sandbox.deleteDirectories([targetDirectory]);
    } else if (existingEntry) {
      await sandbox.deleteFiles([targetDirectory]);
    }
    await sandbox.createDirectories([targetDirectory]);

    const writeEntries: WriteEntry[] = source.files.map((sourceFile) => ({
      path: joinSandboxPath(targetDirectory, sourceFile.relativePath),
      data: sourceFile.content
    }));

    await prepareSandboxFileParentDirectories(
      sandbox,
      writeEntries.map(({ path }) => path)
    );
    await sandbox.writeFiles(writeEntries);

    setRuntimeStateValue(runtimeStateContext.state, stateKey, source.etag);
  }

  await writeSandboxRuntimeState(sandbox, runtimeStateContext);
}

function buildBuiltinSkillSyncSource(source: BuiltinSkillSource): BuiltinSkillSyncSource {
  return {
    ...source,
    etag: computeBuiltinSkillEtag(source.files)
  };
}

function computeBuiltinSkillEtag(files: BuiltinSkillSourceFile[]): string {
  const fileEtags = files
    .map((file) => ({
      relativePath: file.relativePath,
      etag: buildRuntimeHash(file.content)
    }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return buildRuntimeHash(fileEtags.map((file) => `${file.relativePath}:${file.etag}\n`).join(''));
}

const getBuiltinSkillStateHashKey = (name: string) => `${BUILTIN_SKILL_STATE_HASH_PREFIX}${name}`;
