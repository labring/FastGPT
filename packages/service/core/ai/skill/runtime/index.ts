import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { MongoAgentSkills } from '../model/schema';
import { MongoAgentSkillsVersion } from '../version/schema';
import { downloadSkillPackage } from '../package';
import {
  parseSkillMarkdown,
  shellQuote,
  joinSandboxPath,
  getSkillsRootPath,
  getSafeSkillDirectoryName,
  getSkillTargetPath
} from '../utils';
import { getLogger, LogCategories } from '../../../../common/logger';
import type { DeployedSkillInfo } from './types';

export type { DeployedSkillInfo } from './types';

const logger = getLogger(LogCategories.MODULE.AI.AGENT);
const trimSandboxPathRight = (value: string) => (value === '/' ? '' : value.replace(/\/+$/, ''));
const getSandboxParentPath = (path: string) => {
  const normalizedPath = path.replace(/\/+$/, '');
  const slashIndex = normalizedPath.lastIndexOf('/');
  return slashIndex > 0 ? normalizedPath.slice(0, slashIndex) : '/';
};

const parseCommandOutputLines = (stdout: string) => stdout.trim().split('\n').filter(Boolean);

type GetAgentSkillInfosParams = {
  workDirectory?: string;
  skillDirectories?: string[];
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
  sandbox
}: GetAgentSkillInfosParams): Promise<DeployedSkillInfo[]> => {
  const scanDirectories = skillDirectories?.length ? skillDirectories : [workDirectory || '.'];

  // 并发 find 所有目录，过滤出错目录，避免级联报错
  const findResults = await Promise.all(
    scanDirectories.map(async (dir) => {
      const { exitCode, stdout, stderr } = await sandbox.execute(
        `find ${shellQuote(dir)} -iname "SKILL.md" 2>/dev/null`
      );
      if (exitCode !== 0) {
        logger.warn('[Agent Skills] Find command failed for directory', { dir, stderr });
        return [];
      }
      return parseCommandOutputLines(stdout);
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

      return {
        id: file.path,
        name: String(frontmatter.name),
        description: frontmatter.description ? String(frontmatter.description) : '',
        directory: file.path.replace(/\/skill\.md$/i, ''),
        skillMdPath: file.path
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
  workDirectory
}: {
  sandbox: ISandbox;
  skillIds: string[];
  teamId: string;
  workDirectory: string;
}): Promise<DeployedSkillInfo[]> => {
  if (skillIds.length === 0) return [];

  const skills = await MongoAgentSkills.find({
    _id: { $in: skillIds },
    teamId,
    deleteTime: null
  });
  if (skills.length === 0) {
    logger.warn('[Agent Skills] No valid skills found from input skillIds', { skillIds });
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

    const skillId = String(skill._id);
    const targetDir = getSkillTargetPath({
      workDirectory,
      skillId
    });

    return [
      {
        skill,
        version,
        targetDir
      }
    ];
  });
  if (deployableSkills.length === 0) {
    logger.warn(
      '[Agent Skills] No deployable skills found (missing current versions) from input skillIds',
      { skillIds }
    );
    return [];
  }

  const skillsRootPath = getSkillsRootPath(workDirectory);
  // 每轮重新部署当前选择的 skill。这样不会复用半解压、被用户误改或来自旧选择的脏目录。
  const resetSkillsRootResult = await sandbox.execute(
    `rm -rf ${shellQuote(skillsRootPath)} && mkdir -p ${shellQuote(skillsRootPath)}`
  );
  if (resetSkillsRootResult.exitCode !== 0) {
    throw new Error(`Failed to reset skill directory: ${resetSkillsRootResult.stderr}`);
  }

  const parentDirs = deployableSkills.map(({ targetDir }) => targetDir);
  const mkdirResult = await sandbox.execute(
    `mkdir -p ${parentDirs.map((dir) => shellQuote(dir)).join(' ')}`
  );
  if (mkdirResult.exitCode !== 0) {
    throw new Error(`Failed to create skill directories inside sandbox: ${mkdirResult.stderr}`);
  }

  const results = await Promise.all(
    deployableSkills.map(async ({ skill, version, targetDir }) => {
      try {
        const rawPackageBuffer = await downloadSkillPackage({ storageKey: version.storageKey });
        const zipPath = joinSandboxPath(targetDir, 'package.zip');
        const quotedTargetDir = shellQuote(targetDir);
        const unzipCommand = `(${[
          `cd ${quotedTargetDir}`,
          `unzip -o -q package.zip`,
          `rm -f package.zip`
        ].join(' && ')})`;

        return {
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
  const writeResults = await sandbox.writeFiles(writeEntries);
  const failedWrite = writeResults.find((result) => result.error);
  if (failedWrite) {
    await Promise.all(
      deployableSkills.map(({ targetDir }) =>
        sandbox.execute(`rm -rf ${shellQuote(targetDir)}`).catch(() => {})
      )
    );
    throw new Error(`Failed to write skill ZIP packages: ${failedWrite.error?.message}`);
  }

  // 2. Execute a single unified decompression command inside the sandbox container
  const finalUnzipCmd = unzipCommands.join(' && ');
  const extractResult = await sandbox.execute(finalUnzipCmd);
  if (extractResult.exitCode !== 0) {
    await Promise.all(
      deployableSkills.map(({ targetDir }) =>
        sandbox.execute(`rm -rf ${shellQuote(targetDir)}`).catch(() => {})
      )
    );
    throw new Error(`Failed to decompress skill packages inside sandbox: ${extractResult.stderr}`);
  }

  return getAgentSkillInfos({
    sandbox,
    // 只扫描本轮部署出来的 skill 目录，避免工作区其他 SKILL.md 被误注入 prompt。
    skillDirectories: deployableSkills.map(({ targetDir }) => targetDir)
  });
};
