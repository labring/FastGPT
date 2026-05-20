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

// skill 名会进入 sandbox 路径，只保留对目录名安全且可读的部分；真实唯一性由 skillId 保证。
export const getSafeSkillDirectoryName = (skillName: string) => {
  const normalizedSkillName = skillName
    .trim()
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\\/]/g, '-')
    .trim()
    .slice(0, 80);

  return normalizedSkillName && normalizedSkillName !== '.' && normalizedSkillName !== '..'
    ? normalizedSkillName
    : 'skill';
};

export const getSkillTargetPath = ({
  workDirectory,
  skillName,
  skillId,
  version
}: {
  workDirectory: string;
  skillName: string;
  skillId: string;
  version: number;
}) =>
  // 目录名包含版本号，active version 切换后不会复用旧版本目录。
  `${getSkillsRootPath(workDirectory)}/${getSafeSkillDirectoryName(
    skillName
  )}-${skillId}-v${version}`;

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
  const findResult = await sandbox.execute(
    `find ${scanDirectories.map(shellQuote).join(' ')} -iname "SKILL.md" 2>/dev/null`
  );
  if (findResult.exitCode !== 0 || !findResult.stdout.trim()) return [];

  const paths = parseCommandOutputLines(findResult.stdout);
  const files = await sandbox.readFiles(paths);

  const result: DeployedSkillInfo[] = [];
  for (const file of files) {
    const content =
      file.content instanceof Uint8Array
        ? new TextDecoder('utf-8').decode(file.content)
        : String(file.content);
    const { frontmatter } = parseSkillMarkdown(content);
    if (!frontmatter.name) continue;

    const directory = file.path.replace(/\/skill\.md$/i, '');
    result.push({
      id: file.path,
      name: String(frontmatter.name),
      description: frontmatter.description ? String(frontmatter.description) : '',
      directory,
      skillMdPath: file.path
    });
  }

  return result;
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
    throw new Error('No valid skills found');
  }

  const activeVersions = await MongoAgentSkillsVersion.find({
    skillId: { $in: skills.map((skill) => skill._id) },
    isActive: true,
    isDeleted: false
  }).sort({ version: -1 });
  const versionMap = new Map<string, (typeof activeVersions)[number]>();
  // 正常数据下每个 skill 只有一个 active version；这里仍按最高版本兜底，
  // 避免异常历史数据里多个 active 版本导致运行时选择不确定。
  for (const version of activeVersions) {
    const skillId = String(version.skillId);
    if (!versionMap.has(skillId)) {
      versionMap.set(skillId, version);
    }
  }

  const deployableSkills = skills.flatMap((skill) => {
    const version = versionMap.get(String(skill._id));
    if (!version?.storage) return [];

    const skillId = String(skill._id);
    const targetDir = getSkillTargetPath({
      workDirectory,
      skillName: skill.name,
      skillId,
      version: version.version
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
    throw new Error('No deployable skills found (missing active versions)');
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
        const packageBuffer = await downloadSkillPackage({ storageInfo: version.storage });
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
