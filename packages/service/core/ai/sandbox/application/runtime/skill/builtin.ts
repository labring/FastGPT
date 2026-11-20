/**
 * 沙盒业务层：同步内置 Skill 文件到运行态 sandbox。
 *
 * 只管理容器临时层 `/var/lib/fastgpt-runtime/skills` 目录，不进入用户 workspace、`$HOME` 持久卷或发布包。
 */
import type { WriteEntry } from '@alibaba-group/opensandbox';
import type { OpenSandboxClient } from '../../../infrastructure/opensandbox/opensandbox';
import type {
  BuiltinSkillSource,
  BuiltinSkillSourceFile
} from '@fastgpt/global/core/ai/skill/runtime/builtin';
import { getSandboxBuiltinSkillsRootPath } from '../../../infrastructure/opensandbox/runtimeProfile';
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

/**
 * 将内置 Skill 源码注入 sandbox 容器临时层运行态目录。
 *
 * 目标路径位于 `/var/lib/fastgpt-runtime/skills/<name>`，不在 `$HOME` 持久卷或用户 workspace
 * 内，因此不会进入编辑器文件树、冷归档、导出包或发布包，容器重建后自动重新同步。
 */
export async function syncBuiltinSkillsToSandbox({
  sandbox,
  sources
}: {
  sandbox: OpenSandboxClient;
  sources: BuiltinSkillSource[];
}): Promise<void> {
  const syncSources = sources.map(buildBuiltinSkillSyncSource);
  if (syncSources.length === 0) return;

  const builtinSkillsRootPath = getSandboxBuiltinSkillsRootPath();
  const runtimeStateContext = await readSandboxRuntimeState({ sandbox });
  const pendingSources = syncSources.filter(
    (source) =>
      getRuntimeStateValue(runtimeStateContext.state, getBuiltinSkillStateHashKey(source.name)) !==
      source.etag
  );
  if (pendingSources.length === 0) return;

  await sandbox.createDirectories([builtinSkillsRootPath]);
  const existingEntries = await sandbox.listDirectory(builtinSkillsRootPath);
  const existingEntryByPath = new Map(existingEntries.map((entry) => [entry.path, entry]));

  const dirsToDelete: string[] = [];
  const filesToDelete: string[] = [];
  const targetDirectories: string[] = [];
  const writeEntries: WriteEntry[] = [];

  for (const source of pendingSources) {
    const targetDirectory = joinSandboxPath(builtinSkillsRootPath, source.name);
    targetDirectories.push(targetDirectory);

    const existingEntry = existingEntryByPath.get(targetDirectory);
    if (existingEntry?.isDirectory) {
      dirsToDelete.push(targetDirectory);
    } else if (existingEntry) {
      filesToDelete.push(targetDirectory);
    }

    for (const sourceFile of source.files) {
      writeEntries.push({
        path: joinSandboxPath(targetDirectory, sourceFile.relativePath),
        data: sourceFile.content
      });
    }
  }

  if (dirsToDelete.length > 0 || filesToDelete.length > 0) {
    await Promise.all([
      dirsToDelete.length > 0 ? sandbox.deleteDirectories(dirsToDelete) : Promise.resolve(),
      filesToDelete.length > 0
        ? sandbox.deleteFiles(filesToDelete).then((deleteResults) => {
            const failedDelete = deleteResults.find((result) => result.error);
            if (failedDelete) {
              throw new Error(
                `Failed to remove builtin skill path ${failedDelete.path}: ${failedDelete.error?.message}`,
                { cause: failedDelete.error ?? undefined }
              );
            }
          })
        : Promise.resolve()
    ]);
  }

  await sandbox.createDirectories(targetDirectories);
  await prepareSandboxFileParentDirectories(
    sandbox,
    writeEntries.map(({ path }) => path)
  );
  const writeResults = await sandbox.writeFiles(writeEntries);
  const failedWrite = writeResults.find((result) => result.error);
  if (failedWrite) {
    throw new Error(`Failed to write builtin skill files: ${failedWrite.error?.message}`, {
      cause: failedWrite.error ?? undefined
    });
  }

  for (const source of pendingSources) {
    setRuntimeStateValue({
      state: runtimeStateContext.state,
      key: getBuiltinSkillStateHashKey(source.name),
      value: source.etag
    });
  }

  await writeSandboxRuntimeState({ sandbox, context: runtimeStateContext });
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
