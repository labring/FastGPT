import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { MongoAgentSkills } from '../model/schema';
import { MongoAgentSkillsVersion } from '../version/schema';
import { downloadSkillPackage } from '../package';
import { parseSkillMarkdown, getSkillsRootPath } from '../utils';
import { getLogger, LogCategories } from '../../../../common/logger';
import type { DeployedSkillInfo, DeployedSkillVersion } from './types';
import { serviceEnv } from '../../../../env';
import { joinSandboxPath } from '../../sandbox/runtime/utils';
import { authSkillByTmbId } from '../../../../support/permission/skill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';

export type { DeployedSkillInfo, DeployedSkillVersion } from './types';

const logger = getLogger(LogCategories.MODULE.AI.AGENT);
const parseCommandOutputNulls = (stdout: string) => stdout.split('\0').filter(Boolean);
const SKILL_INFO_SCAN_PRUNE_DIRS = ['node_modules', '.venv', 'venv'];

const buildSkillInfoFindCommand = (dir: string) => {
  const pruneClause = SKILL_INFO_SCAN_PRUNE_DIRS.map((name) => `-name ${shellQuote(name)}`).join(
    ' -o '
  );

  return `find ${shellQuote(dir)} \\( ${pruneClause} \\) -prune -o -iname "SKILL.md" -print0 2>/dev/null`;
};

type GetAgentSkillInfosParams = {
  workDirectory?: string;
  skillDirectories?: string[];
  deployedSkillVersions?: DeployedSkillVersion[];
  sandbox: ISandbox;
};

/**
 * 读取传入 sandbox 工作区内可用的 skill 信息。
 *
 * 普通运行和 edit-debug 都以 sandbox 工作区为准：普通运行先注入 skill 包，
 * edit-debug 复用编辑器正在运行的 sandbox，然后统一扫描 SKILL.md。
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

  // 并发 find 所有目录，过滤出错目录，避免级联报错
  const findResults = await Promise.all(
    scanDirectories.map(async (dir) => {
      const { exitCode, stdout, stderr } = await sandbox.execute(buildSkillInfoFindCommand(dir));
      if (exitCode !== 0) {
        logger.warn('[Agent Skills] Find command failed for directory', { dir, stderr });
        return [];
      }
      return parseCommandOutputNulls(stdout);
    })
  );

  const paths = findResults.flat();
  if (paths.length === 0) return [];

  const files = await sandbox.readFiles(paths);

  return files
    .map((file) => {
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

      const { frontmatter, error: parseError } = parseSkillMarkdown(content);
      if (!frontmatter.name) {
        logger.warn(
          '[Agent Skills] Skill parsed without a valid name or has malformed frontmatter',
          {
            path: file.path,
            parseError,
            frontmatter
          }
        );
        return null;
      }

      const directory = file.path.replace(/\/skill\.md$/i, '');
      const deployedVersion = findDeployedVersionByPath(directory, deployedVersionByTargetDir);

      return {
        id: file.path,
        name: String(frontmatter.name),
        description: frontmatter.description ? String(frontmatter.description) : '',
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
 * 该函数不创建、不复用、不释放 sandbox，只负责把 skill 文件写入已有实例。
 * 这样 skill 模块与 sandbox 生命周期保持平级：sandbox 决定何时存在，
 * skill 只在拿到实例后完成文件注入。
 */
export const injectAgentSkillFilesToSandbox = async ({
  sandbox,
  skillIds,
  teamId,
  tmbId,
  workDirectory
}: {
  sandbox: ISandbox;
  skillIds: string[];
  teamId: string;
  tmbId: string;
  workDirectory: string;
}): Promise<DeployedSkillVersion[]> => {
  const skillsRootPath = getSkillsRootPath(workDirectory);
  const prepareSkillsRootResult = await sandbox.execute(`mkdir -p ${shellQuote(skillsRootPath)}`);
  if (prepareSkillsRootResult.exitCode !== 0) {
    throw new Error(`Failed to prepare skill directory: ${prepareSkillsRootResult.stderr}`);
  }

  const existingDirResult = await sandbox.execute(
    `find ${shellQuote(skillsRootPath)} -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null`
  );
  const listedDirs =
    existingDirResult.exitCode === 0 ? parseCommandOutputNulls(existingDirResult.stdout) : [];
  if (existingDirResult.exitCode !== 0) {
    logger.warn('[Agent Skills] Failed to list deployed skill version directories', {
      skillsRootPath,
      stderr: existingDirResult.stderr
    });
  }
  const existingDirs = listedDirs.filter((dir) => isSafeDirectSkillVersionDir(dir, skillsRootPath));

  const cleanupStaleDirs = async (expectedTargetDirs: Set<string>) => {
    const staleDirs = existingDirs.filter((dir) => !expectedTargetDirs.has(dir));
    if (staleDirs.length === 0) return;

    await sandbox
      .execute(`rm -rf ${staleDirs.map((dir) => shellQuote(dir)).join(' ')}`)
      .catch((error) => {
        logger.warn('[Agent Skills] Failed to cleanup stale skill version directories', {
          staleDirs,
          error
        });
      });
  };

  if (skillIds.length === 0) {
    await cleanupStaleDirs(new Set());
    return [];
  }

  const teamSkills = await MongoAgentSkills.find({
    _id: { $in: skillIds },
    teamId,
    deleteTime: null
  });
  if (teamSkills.length === 0) {
    logger.warn('[Agent Skills] No valid skills found from input skillIds', { skillIds });
    await cleanupStaleDirs(new Set());
    return [];
  }

  const skills = (
    await Promise.all(
      teamSkills.map(async (skill) => {
        try {
          await authSkillByTmbId({
            tmbId,
            skillId: String(skill._id),
            per: ReadPermissionVal
          });
          return skill;
        } catch (error) {
          if (error !== SkillErrEnum.unAuthSkill && error !== SkillErrEnum.unExist) {
            throw error;
          }

          logger.warn('[Agent Skills] Skip unauthorized skill during runtime injection', {
            skillId: String(skill._id),
            tmbId
          });
          return null;
        }
      })
    )
  ).filter((skill): skill is (typeof teamSkills)[number] => !!skill);

  if (skills.length === 0) {
    await cleanupStaleDirs(new Set());
    return [];
  }

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
      { skillIds }
    );
    await cleanupStaleDirs(new Set());
    return [];
  }

  const expectedTargetDirs = new Set(deployableSkills.map(({ targetDir }) => targetDir));
  const deployableTargetDirs = new Set(existingDirs);
  const missingSkills = deployableSkills.filter(
    ({ targetDir }) => !deployableTargetDirs.has(targetDir)
  );

  const maxPackageBytes = serviceEnv.AGENT_SANDBOX_SKILL_MAX_SIZE * 1024 * 1024;
  const results = await Promise.all(
    missingSkills.map(async ({ skill, version, versionId, targetDir }) => {
      try {
        const rawPackageBuffer = await downloadSkillPackage({ storageKey: version.storageKey });
        const tempDir = joinSandboxPath(
          skillsRootPath,
          `.tmp-${getSafeRuntimePathSegment(versionId)}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`
        );
        const zipPath = joinSandboxPath(tempDir, 'package.zip');
        const quotedTempDir = shellQuote(tempDir);
        const quotedTargetDir = shellQuote(targetDir);
        const unzipCommand = `(${[
          `cd ${quotedTempDir}`,
          `unzip -Z -t package.zip | awk -v max=${maxPackageBytes} 'BEGIN { ok=0 } /uncompressed,/ { ok=(($3 + 0) <= max) } END { exit ok ? 0 : 1 }'`,
          `unzip -Z1 package.zip | awk 'BEGIN { ok=1 } /^\\// || /(^|\\/)\\.\\.($|\\/)/ { ok=0 } END { exit ok ? 0 : 1 }'`,
          `unzip -o -q package.zip`,
          `rm -f package.zip`,
          `rm -rf ${quotedTargetDir}`,
          `mv ${quotedTempDir} ${quotedTargetDir}`
        ].join(' && ')})`;

        return {
          targetDir,
          tempDir,
          writeEntry: {
            path: zipPath,
            data: rawPackageBuffer
          },
          unzipCommand
        };
      } catch (error) {
        logger.error('[Agent Skills] Failed to prepare skill package', {
          skillName: skill.name,
          error
        });
        throw error;
      }
    })
  );

  const writeEntries = results.map((r) => r.writeEntry);
  const unzipCommands = results.map((r) => r.unzipCommand);

  // 1. Batch write all ZIP packages directly to their respective folders in a single call
  if (writeEntries.length > 0) {
    const tempDirs = results.map(({ tempDir }) => tempDir);
    const mkdirTempResult = await sandbox.execute(
      `mkdir -p ${tempDirs.map((dir) => shellQuote(dir)).join(' ')}`
    );
    if (mkdirTempResult.exitCode !== 0) {
      throw new Error(
        `Failed to create skill temp directories inside sandbox: ${mkdirTempResult.stderr}`
      );
    }

    const writeResults = await sandbox.writeFiles(writeEntries);
    const failedWrite = writeResults.find((result) => result.error);
    if (failedWrite) {
      await Promise.all(
        results.map(({ tempDir }) =>
          sandbox.execute(`rm -rf ${shellQuote(tempDir)}`).catch(() => {})
        )
      );
      throw new Error(`Failed to write skill ZIP packages: ${failedWrite.error?.message}`);
    }

    // 2. Execute a single unified decompression command inside the sandbox container
    const finalUnzipCmd = unzipCommands.join(' && ');
    const extractResult = await sandbox.execute(finalUnzipCmd);
    if (extractResult.exitCode !== 0) {
      await Promise.all(
        results.map(({ tempDir }) =>
          sandbox.execute(`rm -rf ${shellQuote(tempDir)}`).catch(() => {})
        )
      );
      throw new Error(
        `Failed to decompress skill packages inside sandbox: ${extractResult.stderr}`
      );
    }
  }

  await cleanupStaleDirs(expectedTargetDirs);

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
