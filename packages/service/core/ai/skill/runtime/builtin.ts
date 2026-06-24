import { promises as fs } from 'fs';
import path from 'path';
import type { FileWriteEntry, ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getSandboxBuiltinSkillsRootPath } from '../../sandbox/runtime/profile/utils';
import { isProVersion } from '../../../../common/system/constants';
import { resolveSandboxHome } from '../../sandbox/runtime/home';
import { buildRuntimeHash, joinSandboxPath, shellQuote } from '../../sandbox/runtime/utils';
import {
  getRuntimeStateHash,
  readSandboxRuntimeState,
  setRuntimeStateHash,
  writeSandboxRuntimeState
} from '../../sandbox/runtime/state';

const logger = getLogger(LogCategories.MODULE.AI.AGENT);

const PRO_BUILTIN_SKILL_RELATIVE_ROOT = 'pro/admin/src/service/core/ai/skill/builtin';
const BUILTIN_SKILL_STATE_HASH_PREFIX = 'builtinSkill:';
const EDIT_DEBUG_BUILTIN_SKILL_NAMES = ['skill-creator'];

export type BuiltinSkillSource = {
  name: string;
  sourceDirectory: string;
};

type BuiltinSkillSourceFile = {
  relativePath: string;
  content: Buffer;
};

type BuiltinSkillSyncSource = BuiltinSkillSource & {
  files: BuiltinSkillSourceFile[];
  etag: string;
};

/**
 * 返回当前部署可用的内置 Skill 源码目录。
 *
 * 内置 Skill 的具体内容属于 pro，社区版或缺少 pro 源码时这里自然返回空列表。
 * service 层只负责通用发现与注入机制，不内置具体 `SKILL.md` 内容。
 */
export async function getAvailableBuiltinSkillSources({
  includeNames
}: {
  includeNames?: string[];
} = {}): Promise<BuiltinSkillSource[]> {
  if (!isProVersion()) return [];

  const builtinSkillRoot = await findProBuiltinSkillRoot();
  if (!builtinSkillRoot) {
    if (includeNames?.length) {
      logger.warn('[Agent Skills] Builtin skill root not found, skip builtin skill injection', {
        includeNames
      });
    }
    return [];
  }

  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(builtinSkillRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn('[Agent Skills] Failed to inspect builtin skill root', {
        root: builtinSkillRoot,
        error
      });
    }
    return [];
  }

  const includeNameSet = includeNames ? new Set(includeNames) : undefined;
  const sources: BuiltinSkillSource[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (includeNameSet && !includeNameSet.has(entry.name)) continue;

    const sourceDirectory = path.join(builtinSkillRoot, entry.name);
    const skillMdPath = path.join(sourceDirectory, 'SKILL.md');
    try {
      await fs.access(skillMdPath);
      sources.push({
        name: entry.name,
        sourceDirectory
      });
    } catch {
      logger.warn('[Agent Skills] Builtin skill directory skipped without SKILL.md', {
        sourceDirectory
      });
    }
  }

  if (includeNameSet) {
    const foundNames = new Set(sources.map((source) => source.name));
    const missingName = includeNames?.find((name) => !foundNames.has(name));
    if (missingName) {
      throw new Error(`Builtin skill not found or missing SKILL.md: ${missingName}`);
    }
  }

  return sources;
}

export function getBuiltinSkillsRootPath(homeDirectory: string): string {
  return getSandboxBuiltinSkillsRootPath(homeDirectory);
}

/**
 * 注入 edit-debug runtime 需要的平台内置 Skill。
 *
 * 该入口隐藏 HOME 解析和内置 skill 名单，调用方只表达“当前 sandbox 需要补齐
 * edit-debug 内置能力”。目前只预置 skill-creator。
 */
export async function injectEditDebugBuiltinSkillsToSandbox(sandbox: ISandbox): Promise<void> {
  const homeDirectory = await resolveSandboxHome(sandbox);
  if (!homeDirectory) {
    throw new Error('Failed to resolve sandbox HOME for builtin skill sync');
  }

  await syncBuiltinSkillsToSandbox({
    sandbox,
    homeDirectory,
    includeNames: EDIT_DEBUG_BUILTIN_SKILL_NAMES
  });
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
  includeNames,
  sources
}: {
  sandbox: ISandbox;
  homeDirectory: string;
  includeNames?: string[];
  sources?: BuiltinSkillSource[];
}): Promise<void> {
  const skillSources = sources ?? (await getAvailableBuiltinSkillSources({ includeNames }));
  const syncSources = await Promise.all(skillSources.map(buildBuiltinSkillSyncSource));
  if (syncSources.length === 0) return;

  const builtinSkillsRootPath = getBuiltinSkillsRootPath(homeDirectory);
  const runtimeStateContext = await readSandboxRuntimeState({ sandbox, homeDirectory });

  for (const source of syncSources) {
    const targetDirectory = joinSandboxPath(builtinSkillsRootPath, source.name);
    const stateKey = getBuiltinSkillStateHashKey(source.name);
    if (getRuntimeStateHash(runtimeStateContext.state, stateKey) === source.etag) {
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

    setRuntimeStateHash(runtimeStateContext.state, stateKey, source.etag);
    await writeSandboxRuntimeState(sandbox, runtimeStateContext);
  }
}

async function collectSourceFiles(
  directory: string,
  relativeBase = ''
): Promise<BuiltinSkillSourceFile[]> {
  const entries = await fs.readdir(path.join(directory, relativeBase), { withFileTypes: true });
  const files: BuiltinSkillSourceFile[] = [];

  for (const entry of entries) {
    const relativePath = relativeBase ? path.join(relativeBase, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(directory, relativePath)));
      continue;
    }
    if (!entry.isFile()) continue;

    files.push({
      relativePath: relativePath.split(path.sep).join('/'),
      content: await fs.readFile(path.join(directory, relativePath))
    });
  }

  return files;
}

async function buildBuiltinSkillSyncSource(
  source: BuiltinSkillSource
): Promise<BuiltinSkillSyncSource> {
  const files = await collectSourceFiles(source.sourceDirectory);
  return {
    ...source,
    files,
    etag: computeBuiltinSkillEtag(files)
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

/**
 * 从当前工作目录向上寻找 pro 内置 Skill 源码根目录。
 *
 * 测试、Next app、worker 和 monorepo 根启动时的 cwd 可能不同，因此不能把
 * `process.cwd()` 直接假设为仓库根。
 */
async function findProBuiltinSkillRoot(): Promise<string | undefined> {
  let current = process.cwd();

  while (true) {
    const candidate = path.join(current, PRO_BUILTIN_SKILL_RELATIVE_ROOT);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('[Agent Skills] Failed to inspect builtin skill candidate root', {
          root: candidate,
          error
        });
      }
    }

    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}
