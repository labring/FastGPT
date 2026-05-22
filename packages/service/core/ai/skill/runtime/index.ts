import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { MongoAgentSkills } from '../model/schema';
import { MongoAgentSkillsVersion } from '../version/schema';
import { downloadSkillPackage } from '../package';
import { parseSkillMarkdown } from '../utils/skillMarkdown';
import { getLogger, LogCategories } from '../../../../common/logger';
import type { DeployedSkillInfo } from './types';

export type { DeployedSkillInfo } from './types';

const logger = getLogger(LogCategories.MODULE.AI.AGENT);

export const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
const trimSandboxPathRight = (value: string) => (value === '/' ? '' : value.replace(/\/+$/, ''));
export const joinSandboxPath = (basePath: string, path: string) =>
  `${trimSandboxPathRight(basePath)}/${path}`;

export const getSkillsRootPath = (workDirectory: string) =>
  joinSandboxPath(workDirectory, 'skills');

export const getSafeSkillDirectoryName = (skillName: string) => {
  const normalized = skillName
    .trim()
    // 1. 将空格和空白字符替换为中划线
    .replace(/\s+/g, '-')
    // 2. 只保留中文、英文、数字、中划线和下划线，其它所有非法/危险字符都替换为中划线
    .replace(/[^\w\u4e00-\u9fa5-]/g, '-')
    // 3. 将连续的多个中划线或下划线合并为单个
    .replace(/-+/g, '-')
    .replace(/_+/g, '_')
    // 4. 去除首尾的多余中划线/下划线
    .replace(/^[-_]|[-_]$/g, '')
    // 5. 限制长度在合理范围
    .slice(0, 50)
    .trim();

  // 6. 排除特殊目录名或为空、纯中/下划线的情况，使用安全回退值
  return normalized && normalized !== '.' && normalized !== '..' && !/^[-_]+$/.test(normalized)
    ? normalized
    : 'skill';
};

export const getSkillTargetPath = ({
  workDirectory,
  skillName,
  skillId,
  versionId
}: {
  workDirectory: string;
  skillName: string;
  skillId: string;
  versionId: string;
}) =>
  // 目录名包含版本 id，当前版本切换后不会复用旧版本目录。
  `${getSkillsRootPath(workDirectory)}/${getSafeSkillDirectoryName(
    skillName
  )}-${skillId}-v${versionId}`;

export const getEditSkillTargetPath = ({
  workDirectory,
  skillName,
  skillId
}: {
  workDirectory: string;
  skillName: string;
  skillId: string;
}) =>
  // 编辑态没有 version 语义，固定目录可让代码编辑器和保存发布读取同一份文件。
  `${getSkillsRootPath(workDirectory)}/${getSafeSkillDirectoryName(skillName)}-${skillId}-edit`;

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
      skillName: skill.name,
      skillId,
      versionId: String(version._id)
    });

    return [
      {
        skill,
        version,
        targetDir,
        zipPath: joinSandboxPath(workDirectory, `package_${skillId}.zip`)
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

  await Promise.all(
    deployableSkills.map(async ({ skill, version, targetDir, zipPath }) => {
      try {
        const packageBuffer = await downloadSkillPackage({ storageKey: version.storageKey });
        const extractCommand = `mkdir -p ${shellQuote(targetDir)} && unzip -o ${shellQuote(
          zipPath
        )} -d ${shellQuote(targetDir)} && rm ${shellQuote(zipPath)}`;

        await sandbox.writeFiles([{ path: zipPath, data: packageBuffer }]);

        const extractResult = await sandbox.execute(extractCommand);

        if (extractResult.exitCode !== 0) {
          // 解压失败时清理目标目录和临时 zip，避免下一轮扫描到不完整的 skill 包。
          await sandbox.execute(`rm -rf ${shellQuote(targetDir)} ${shellQuote(zipPath)}`);
          throw new Error(
            `Failed to extract skill package "${skill.name}": ${extractResult.stderr}`
          );
        }
      } catch (error) {
        logger.error('[Agent Skills] Failed to inject skill package', {
          skillName: skill.name,
          error
        });
        throw error;
      }
    })
  );

  return getAgentSkillInfos({
    sandbox,
    // 只扫描本轮部署出来的 skill 目录，避免工作区其他 SKILL.md 被误注入 prompt。
    skillDirectories: deployableSkills.map(({ targetDir }) => targetDir)
  });
};
