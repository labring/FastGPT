import type { FileWriteEntry, ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import type {
  BuiltinSkillSource,
  BuiltinSkillSourceFile
} from '@fastgpt/global/core/ai/skill/runtime/builtin';
import { getSandboxBuiltinSkillsRootPath } from '../../sandbox/runtime/profile/utils';
import { buildRuntimeHash, joinSandboxPath } from '../../sandbox/runtime/utils';
import {
  getRuntimeStateValue,
  readSandboxRuntimeState,
  setRuntimeStateValue,
  writeSandboxRuntimeState
} from '../../sandbox/runtime/state';

const BUILTIN_SKILL_STATE_HASH_PREFIX = 'builtinSkill:';

type BuiltinSkillSyncSource = BuiltinSkillSource & {
  files: BuiltinSkillSourceFile[];
  etag: string;
};

export function getBuiltinSkillsRootPath(homeDirectory: string): string {
  return getSandboxBuiltinSkillsRootPath(homeDirectory);
}

/**
 * 将内置 Skill 源码注入 sandbox 用户主目录。
 *
 * 目标路径位于 `<homeDirectory>/.fastgpt/skills/<name>`，不在用户 workspace
 * 内，因此不会进入编辑器文件树、导出包或发布包。
 */
export async function syncBuiltinSkillsToSandbox({
  sandbox,
  homeDirectory,
  sources
}: {
  sandbox: ISandbox;
  homeDirectory: string;
  sources: BuiltinSkillSource[];
}): Promise<void> {
  const syncSources = sources.map(buildBuiltinSkillSyncSource);
  if (syncSources.length === 0) return;

  const builtinSkillsRootPath = getBuiltinSkillsRootPath(homeDirectory);
  const runtimeStateContext = await readSandboxRuntimeState({ sandbox, homeDirectory });

  for (const source of syncSources) {
    const targetDirectory = joinSandboxPath(builtinSkillsRootPath, source.name);
    const stateKey = getBuiltinSkillStateHashKey(source.name);
    if (getRuntimeStateValue(runtimeStateContext.state, stateKey) === source.etag) {
      continue;
    }

    const prepareResult = await sandbox.execute(
      `rm -rf ${shellQuote(targetDirectory)} && mkdir -p ${shellQuote(targetDirectory)}`
    );
    if (prepareResult.exitCode !== 0) {
      throw new Error(`Failed to prepare builtin skill directory: ${prepareResult.stderr}`);
    }

    const writeEntries: FileWriteEntry[] = source.files.map((sourceFile) => ({
      path: joinSandboxPath(targetDirectory, sourceFile.relativePath),
      data: sourceFile.content
    }));

    const writeResults = await sandbox.writeFiles(writeEntries);
    const failedWrite = writeResults.find((result) => result.error);
    if (failedWrite) {
      throw new Error(`Failed to write builtin skill files: ${failedWrite.error?.message}`);
    }

    setRuntimeStateValue(runtimeStateContext.state, stateKey, source.etag);
    await writeSandboxRuntimeState(sandbox, runtimeStateContext);
  }
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
