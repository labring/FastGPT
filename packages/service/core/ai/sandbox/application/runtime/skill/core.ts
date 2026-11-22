/**
 * 沙盒业务层：在运行态 sandbox 内注入和扫描已发布 Skill。
 *
 * 负责读取 Skill 版本包并通过 IDE Agent `/archive/extract` 流式解压到现有 sandbox，不创建或清理 sandbox 实例。
 */
import type { OpenSandboxClient } from '../../../infrastructure/opensandbox/opensandbox';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { isRedisLeaseError } from '@fastgpt/dal/redis/caches';
import { MongoAgentSkillsVersion } from '../../../../skill/version/schema';
import {
  extractSkillMetadataFromMarkdown,
  RUNTIME_SKILL_SCAN_PRUNE_DIRS
} from '../../../../skill/utils';
import { getLogger, LogCategories } from '../../../../../../common/logger';
import type { DeployedSkillInfo, DeployedSkillVersion } from './types';
import { joinSandboxPath } from '../../../utils';
import type { AgentSkillSchemaType } from '@fastgpt/global/core/ai/skill/type';
import { SKILL_ENTRYPOINT_STATE_LIST_KEY } from '../../../constants';
import {
  getRuntimeStateValue,
  readSandboxRuntimeState,
  setRuntimeStateValue,
  writeSandboxRuntimeState
} from '../state';
import { extractToSandboxDirectory } from '../../ideAgent';
import { openSkillPackageTarZstStream } from '../../../../skill/package/storage';

const logger = getLogger(LogCategories.MODULE.AI.AGENT);
const parseCommandOutputNulls = (stdout: string) =>
  Array.from(new Set(stdout.split('\0').filter(Boolean)));
// 扫描规则与发布校验同源：prune 基础列表来自 skill/utils，额外跳过沙盒运行与挂载保留目录。
const SKILL_INFO_SCAN_PRUNE_DIRS = [
  ...RUNTIME_SKILL_SCAN_PRUNE_DIRS,
  '.fastgpt',
  'lost+found'
] as const;

/** 将多个待扫描目录合并为单次 `find -prune` 命令，避免缺省目录导致整条命令失败。 */
const buildSkillInfoFindCommand = (dirs: string[]) => {
  const uniqueDirs = Array.from(new Set(dirs.map((dir) => dir.trim()).filter(Boolean)));
  if (uniqueDirs.length === 0) return 'true';
  const pruneClause = SKILL_INFO_SCAN_PRUNE_DIRS.map((name) => `-name ${shellQuote(name)}`).join(
    ' -o '
  );
  const quotedDirs = uniqueDirs
    .map((dir) => shellQuote(dir.startsWith('-') ? `./${dir}` : dir))
    .join(' ');

  return [
    'set --',
    `for d in ${quotedDirs}; do [ -d "$d" ] && set -- "$@" "$d"; done`,
    `[ "$#" -eq 0 ] || find "$@" \\( ${pruneClause} \\) -prune -o -type f -iname "SKILL.md" -print0 2>/dev/null`
  ].join('; ');
};

const MAX_SKILL_EXTRACT_CONCURRENCY = 3;

type GetAgentSkillInfosParams = {
  workDirectory?: string;
  skillDirectories?: string[];
  deployedSkillVersions?: DeployedSkillVersion[];
  sandbox: OpenSandboxClient;
};

/**
 * 读取传入 sandbox 工作区内可用的 skill 信息。
 *
 * 普通运行和 edit-debug 都以 sandbox 工作区为准：普通运行先注入 skill 包，
 * edit-debug 复用编辑器正在运行的 sandbox，然后通过单次 `find -prune` 统一递归扫描 `SKILL.md` 并跳过无效项。
 */
export const getAgentSkillInfos = async ({
  workDirectory,
  skillDirectories,
  deployedSkillVersions,
  sandbox
}: GetAgentSkillInfosParams): Promise<DeployedSkillInfo[]> => {
  const scanDirectories = skillDirectories?.length ? skillDirectories : [workDirectory || '.'];
  const deployedVersionByTargetDir = new Map(
    deployedSkillVersions?.map((version) => [normalizeSandboxDir(version.targetDir), version]) || []
  );

  const { exitCode, stdout, stderr } = await sandbox.execute(
    buildSkillInfoFindCommand(scanDirectories)
  );
  if (exitCode !== 0) {
    logger.warn('[Agent Skills] Find command failed for directories', {
      scanDirectories,
      stderr
    });
    return [];
  }

  const paths = parseCommandOutputNulls(stdout).sort();
  if (paths.length === 0) return [];

  const files = await sandbox.readFiles(paths);

  return files
    .map((file): DeployedSkillInfo | null => {
      if (file.error) {
        logger.error('[Agent Skills] Failed to read skill.md file', {
          path: file.path,
          error: file.error
        });
        return null;
      }

      const content =
        file.content instanceof Uint8Array
          ? new TextDecoder('utf-8').decode(file.content)
          : String(file.content);

      const parsed = extractSkillMetadataFromMarkdown(content);
      if (!parsed.valid) {
        logger.warn(
          '[Agent Skills] Skill parsed without a valid name or has malformed frontmatter',
          {
            path: file.path,
            error: parsed.error
          }
        );
        return null;
      }

      const directory = file.path.replace(/\/skill\.md$/i, '');
      const deployedVersion = findDeployedVersionByPath(directory, deployedVersionByTargetDir);

      return {
        id: file.path,
        name: parsed.name,
        description: parsed.description,
        directory,
        skillMdPath: file.path,
        ...(deployedVersion
          ? {
              appId: deployedVersion.skillId,
              appName: deployedVersion.name,
              appDescription: deployedVersion.description
            }
          : {})
      };
    })
    .filter((info): info is DeployedSkillInfo => !!info);
};

/**
 * 将已发布的 skill 包注入到调用方传入的 sandbox 实例。
 *
 * 通过 S3 流式传输（`.tar.zst` 直传、`.zip` 走 HTTP Range 实时转码）发往容器 IDE Agent `/archive/extract`
 * 解压至临时目录（agent 自动创建）后再原子 `moveFiles` 到版本目录，全程零 `/tmp` 落盘。
 * 已发布版本按 versionId 缓存；只有临时目录会自动回收。
 */
export const injectAgentSkillFilesToSandbox = async ({
  sandbox,
  skills,
  workDirectory,
  signal
}: {
  sandbox: OpenSandboxClient;
  skills: AgentSkillSchemaType[];
  workDirectory: string;
  signal?: AbortSignal;
}): Promise<DeployedSkillVersion[]> => {
  const skillsRootPath = joinSandboxPath(workDirectory, 'projects');
  await sandbox.createDirectories([skillsRootPath]);
  const listedEntries = await sandbox.listDirectory(skillsRootPath);
  const listedDirs = listedEntries.filter((entry) => entry.isDirectory).map((entry) => entry.path);
  const existingDirs = listedDirs.filter((dir) => isSafeDirectSkillVersionDir(dir, skillsRootPath));
  const staleTempDirs = listedDirs.filter((dir) => isSafeDirectSkillTempDir(dir, skillsRootPath));

  if (staleTempDirs.length > 0) {
    await sandbox.deleteDirectories(staleTempDirs).catch((error) => {
      logger.warn('[Agent Skills] Failed to cleanup stale temporary skill directories', {
        staleTempDirs,
        error
      });
    });
  }

  // 已发布版本按 versionId 缓存；其他节点和会话可能仍在使用，初始化只追加，不回收正式目录。
  if (skills.length === 0) return [];

  const currentVersionIds = skills
    .map((skill) => skill.currentVersionId)
    .filter((id): id is NonNullable<typeof id> => !!id);
  const currentVersions =
    currentVersionIds.length > 0
      ? await MongoAgentSkillsVersion.find({
          _id: { $in: currentVersionIds }
        })
      : [];
  const versionMap = new Map<string, (typeof currentVersions)[number]>();
  for (const version of currentVersions) {
    versionMap.set(String(version.skillId), version);
  }

  const deployableSkills = skills.flatMap((skill) => {
    const version = versionMap.get(String(skill._id));
    if (!version?.storageKey) return [];

    const versionId = String(version._id);
    const targetDir = joinSandboxPath(skillsRootPath, versionId);

    return [
      {
        skill,
        version,
        versionId,
        targetDir
      }
    ];
  });
  if (deployableSkills.length === 0) {
    logger.warn(
      '[Agent Skills] No deployable skills found (missing current versions) from input skillIds',
      { skillIds: skills.map((skill) => String(skill._id)) }
    );
    return [];
  }

  const deployableTargetDirs = new Set(existingDirs);
  const missingSkills = deployableSkills.filter(
    ({ targetDir }) => !deployableTargetDirs.has(targetDir)
  );

  const results = missingSkills.map(({ version, versionId, targetDir }) => {
    const tempDir = joinSandboxPath(
      skillsRootPath,
      `.tmp-${getSafeRuntimePathSegment(versionId)}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`
    );

    return {
      storageKey: version.storageKey,
      targetDir,
      tempDir
    };
  });

  if (results.length > 0) {
    const tempDirs = results.map(({ tempDir }) => tempDir);
    const cleanupTempDirs = () => sandbox.deleteDirectories(tempDirs).catch(() => undefined);

    try {
      await batchRun(
        results,
        (current) =>
          extractToSandboxDirectory({
            sandbox,
            targetDirectory: current.tempDir,
            signal,
            openBody: () => openSkillPackageTarZstStream({ storageKey: current.storageKey })
          }),
        MAX_SKILL_EXTRACT_CONCURRENCY
      );
    } catch (error) {
      if (!isRedisLeaseError(error) && !signal?.aborted) {
        await cleanupTempDirs();
      }
      throw error;
    }

    try {
      await sandbox.moveFiles(
        results.map(({ tempDir, targetDir }) => ({ src: tempDir, dest: targetDir }))
      );
      // 目录重建后清理容器运行态状态中对应版本的旧初始化标记，确保下次执行重新触发版本 entrypoint。
      const stateContext = await readSandboxRuntimeState({ sandbox });
      const oldEntrypoints = getRuntimeStateValue(
        stateContext.state,
        SKILL_ENTRYPOINT_STATE_LIST_KEY
      );
      if (Array.isArray(oldEntrypoints)) {
        const installedVersionIds = new Set(missingSkills.map(({ versionId }) => versionId));
        const keptEntrypoints = oldEntrypoints.filter((id) => !installedVersionIds.has(id));
        if (keptEntrypoints.length !== oldEntrypoints.length) {
          setRuntimeStateValue({
            state: stateContext.state,
            key: SKILL_ENTRYPOINT_STATE_LIST_KEY,
            value: keptEntrypoints
          });
          await writeSandboxRuntimeState({ sandbox, context: stateContext });
        }
      }
    } catch (error) {
      if (!isRedisLeaseError(error) && !signal?.aborted) {
        await Promise.all([
          cleanupTempDirs(),
          sandbox
            .deleteDirectories(results.map(({ targetDir }) => targetDir))
            .catch(() => undefined)
        ]);
      }
      throw error;
    }
  }

  return deployableSkills.map(({ skill, versionId, targetDir }) => ({
    skillId: String(skill._id),
    name: skill.name,
    description: skill.description || '',
    avatar: skill.avatar,
    versionId,
    targetDir
  }));
};

const getSafeRuntimePathSegment = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, '-');

const normalizeSandboxDir = (dir: string): string => dir.replace(/\/+$/, '');

const findDeployedVersionByPath = (
  path: string,
  deployedVersionByTargetDir: Map<string, DeployedSkillVersion>
): DeployedSkillVersion | undefined => {
  const normalizedPath = normalizeSandboxDir(path);
  const sortedTargetDirs = Array.from(deployedVersionByTargetDir.keys()).sort(
    (a, b) => b.length - a.length
  );

  return deployedVersionByTargetDir.get(
    sortedTargetDirs.find((targetDir) => {
      return normalizedPath === targetDir || normalizedPath.startsWith(`${targetDir}/`);
    }) || ''
  );
};

const isSafeDirectSkillVersionDir = (dir: string, skillsRootPath: string): boolean => {
  const root = skillsRootPath === '/' ? '' : skillsRootPath.replace(/\/+$/, '');
  const prefix = `${root}/`;
  if (!dir.startsWith(prefix)) return false;

  const name = dir.slice(prefix.length);
  return /^[a-fA-F0-9]{24}$/.test(name);
};

const isSafeDirectSkillTempDir = (dir: string, skillsRootPath: string): boolean => {
  const root = skillsRootPath === '/' ? '' : skillsRootPath.replace(/\/+$/, '');
  const prefix = `${root}/`;
  if (!dir.startsWith(prefix)) return false;

  const name = dir.slice(prefix.length);
  return /^\.tmp-[a-zA-Z0-9_-]+$/.test(name);
};
