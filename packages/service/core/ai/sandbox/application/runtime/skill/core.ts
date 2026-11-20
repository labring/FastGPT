/**
 * 沙盒业务层：在运行态 sandbox 内注入和扫描已发布 Skill。
 *
 * 负责读取 Skill 版本包并写入现有 sandbox，不创建或清理 sandbox 实例。
 */
import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { MongoAgentSkillsVersion } from '../../../../skill/version/schema';
import { downloadSkillPackageStream } from '../../../../skill/package';
import {
  filterSkillScanPathsByDeclaredEntries,
  RUNTIME_SKILL_SCAN_PRUNE_DIRS,
  selectSkillEntryPaths,
  toRelativeScanPath
} from '../../../../skill/package/skillEntryScan';
import { parseSkillMarkdown } from '../../../../skill/utils';
import { getLogger, LogCategories } from '../../../../../../common/logger';
import type { DeployedSkillInfo, DeployedSkillVersion } from './types';
import { getAgentSandboxSkillMaxBytes } from '../../../config';
import { joinSandboxPath } from '../../../utils';
import type { AgentSkillSchemaType } from '@fastgpt/global/core/ai/skill/type';
import { Readable } from 'node:stream';
import { SKILL_ENTRYPOINT_STATE_LIST_KEY } from '../../../constants';
import {
  getRuntimeStateValue,
  readSandboxRuntimeState,
  setRuntimeStateValue,
  writeSandboxRuntimeState
} from '../state';

const logger = getLogger(LogCategories.MODULE.AI.AGENT);
const parseCommandOutputNulls = (stdout: string) => stdout.split('\0').filter(Boolean);

// 扫描规则与发布校验同源：prune 目录列表来自 skill/package，避免两端规则漂移。
const getRuntimeSkillsRootPath = (workDirectory: string): string =>
  joinSandboxPath(workDirectory, 'projects');

const buildSkillInfoFindCommand = (dir: string) => {
  const pruneClause = RUNTIME_SKILL_SCAN_PRUNE_DIRS.map((name) => `-name ${shellQuote(name)}`).join(
    ' -o '
  );

  return `find ${shellQuote(dir)} \\( ${pruneClause} \\) -prune -o -type f -iname "SKILL.md" -print0 2>/dev/null`;
};

type GetAgentSkillInfosParams = {
  workDirectory?: string;
  skillDirectories?: string[];
  deployedSkillVersions?: DeployedSkillVersion[];
  sandbox: ISandbox;
};

/** find 命中的一条 SKILL.md 及其扫描上下文。 */
type ScannedSkillPath = {
  path: string;
  scanDirectory: string;
  relativePath: string;
  deployedVersion?: DeployedSkillVersion;
  /** 非版本目录在解析后应用「标准有效入口优先」；版本目录已按契约处理。 */
  applyStandardEntryFallback: boolean;
};

type ParsedSkillInfo = {
  info: DeployedSkillInfo;
  scannedPath?: ScannedSkillPath;
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

  // 并发 find 所有目录，过滤出错目录，避免级联报错。
  // 记录每条命中路径所属的扫描根，非版本目录需要在解析 SKILL.md 后再应用入口选择规则。
  const findResults = await Promise.all(
    scanDirectories.map(async (dir): Promise<ScannedSkillPath[]> => {
      const { exitCode, stdout, stderr } = await sandbox.execute(buildSkillInfoFindCommand(dir));
      if (exitCode !== 0) {
        logger.warn('[Agent Skills] Find command failed for directory', { dir, stderr });
        return [];
      }
      const foundPaths = parseCommandOutputNulls(stdout);
      const deployedVersion = findDeployedVersionByPath(dir, deployedVersionByTargetDir);

      // 只有显式带 `explicit-v1` 契约且声明非空的版本，才把 runtimeSkills 当作完整入口清单；
      // 旧版本（字段缺失）保持基点行为：递归扫描版本目录。
      if (
        deployedVersion?.skillEntryContract === 'explicit-v1' &&
        deployedVersion.skillMdPaths?.length
      ) {
        return filterSkillScanPathsByDeclaredEntries({
          scanDirectory: dir,
          paths: foundPaths,
          declaredPaths: deployedVersion.skillMdPaths
        }).map((path) => ({
          path,
          scanDirectory: dir,
          relativePath: toRelativeScanPath(path, dir),
          deployedVersion,
          applyStandardEntryFallback: false
        }));
      }

      // 旧版本目录全量递归扫描；编辑调试工作区、内置技能目录同样先保留全部候选，
      // 待解析出有效 frontmatter 后，再按「标准有效入口优先」回退，避免标准路径草稿挤掉根级入口。
      return foundPaths.map((path) => ({
        path,
        scanDirectory: dir,
        relativePath: toRelativeScanPath(path, dir),
        ...(deployedVersion ? { deployedVersion } : {}),
        applyStandardEntryFallback: !deployedVersion
      }));
    })
  );

  const scannedPaths = findResults.flat();
  if (scannedPaths.length === 0) return [];

  const scannedPathByPath = new Map(scannedPaths.map((scanned) => [scanned.path, scanned]));
  const files = await sandbox.readFiles(scannedPaths.map(({ path }) => path));

  const parsedSkills = files
    .map((file): ParsedSkillInfo | null => {
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
        info: {
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
        },
        scannedPath: scannedPathByPath.get(file.path)
      };
    })
    .filter((parsed): parsed is ParsedSkillInfo => !!parsed);

  // 版本目录直接采用解析结果；非版本目录按扫描根分组后做「标准有效入口优先」。
  const skillInfos: DeployedSkillInfo[] = [];
  const fallbackGroups = new Map<string, ParsedSkillInfo[]>();
  for (const parsed of parsedSkills) {
    if (!parsed.scannedPath?.applyStandardEntryFallback) {
      skillInfos.push(parsed.info);
      continue;
    }

    const group = fallbackGroups.get(parsed.scannedPath.scanDirectory) ?? [];
    group.push(parsed);
    fallbackGroups.set(parsed.scannedPath.scanDirectory, group);
  }

  for (const group of fallbackGroups.values()) {
    // 只有解析成功（frontmatter 有 name）的标准入口才算有效；草稿不触发优先规则。
    const selectedRelativePaths = new Set(
      selectSkillEntryPaths(group.map(({ scannedPath }) => scannedPath!.relativePath))
    );
    for (const parsed of group) {
      if (selectedRelativePaths.has(parsed.scannedPath!.relativePath)) {
        skillInfos.push(parsed.info);
      }
    }
  }

  return skillInfos;
};

/**
 * 将已发布的 skill 包注入到调用方传入的 sandbox 实例。
 *
 * skills 必须由调用方完成授权；这里不读取工作流上下文，也不执行成员权限判断。
 * 该函数只负责把 skill 文件写入已有实例。
 * 这样 skill 模块与 sandbox 生命周期保持平级：sandbox 决定何时存在，
 * skill 只在拿到实例后完成文件注入。正式版本保留到缓存或沙盒被显式清理，只有临时目录会自动回收。
 */
export const injectAgentSkillFilesToSandbox = async ({
  sandbox,
  skills,
  workDirectory
}: {
  sandbox: ISandbox;
  skills: AgentSkillSchemaType[];
  workDirectory: string;
}): Promise<DeployedSkillVersion[]> => {
  const skillsRootPath = getRuntimeSkillsRootPath(workDirectory);
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

  const maxPackageBytes = getAgentSandboxSkillMaxBytes();
  const results = missingSkills.map(({ version, versionId, targetDir }) => {
    const tempDir = joinSandboxPath(
      skillsRootPath,
      `.tmp-${getSafeRuntimePathSegment(versionId)}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`
    );
    const zipPath = joinSandboxPath(tempDir, 'package.zip');
    const quotedZipPath = shellQuote(zipPath);
    const unzipCommand = `(${[
      `unzip -Z -t ${quotedZipPath} | awk -v max=${maxPackageBytes} 'BEGIN { ok=0 } /uncompressed,/ { ok=(($3 + 0) <= max) } END { exit ok ? 0 : 1 }'`,
      `unzip -Z1 ${quotedZipPath} | awk 'BEGIN { ok=1 } /^\\// || /(^|\\/)\\.\\.($|\\/)/ { ok=0 } END { exit ok ? 0 : 1 }'`,
      `unzip -o -q ${quotedZipPath} -d ${shellQuote(tempDir)}`
    ].join(' && ')})`;

    return {
      storageKey: version.storageKey,
      targetDir,
      tempDir,
      zipPath,
      unzipCommand
    };
  });

  // 1. Stream each ZIP package directly to its temporary directory.
  if (results.length > 0) {
    const tempDirs = results.map(({ tempDir }) => tempDir);
    const cleanupTempDirs = () => sandbox.deleteDirectories(tempDirs).catch(() => undefined);
    await sandbox.createDirectories(tempDirs);

    try {
      for (const { storageKey, zipPath } of results) {
        const packageStream = await downloadSkillPackageStream({ storageKey });
        try {
          const [writeResult] = await sandbox.writeFiles([
            {
              path: zipPath,
              data: Readable.toWeb(packageStream) as ReadableStream<Uint8Array>
            }
          ]);
          if (writeResult?.error) {
            throw new Error(`Failed to write skill ZIP package: ${writeResult.error.message}`);
          }
        } finally {
          if (!packageStream.destroyed) packageStream.destroy();
        }
      }
    } catch (error) {
      await cleanupTempDirs();
      throw error;
    }

    // 2. Execute a single unified decompression command inside the sandbox container
    const finalUnzipCmd = results.map(({ unzipCommand }) => unzipCommand).join(' && ');
    const extractResult = await sandbox.execute(finalUnzipCmd);
    if (extractResult.exitCode !== 0) {
      await cleanupTempDirs();
      throw new Error(
        `Failed to decompress skill packages inside sandbox: ${extractResult.stderr}`
      );
    }

    const deleteResults = await sandbox.deleteFiles(results.map(({ zipPath }) => zipPath));
    const failedDelete = deleteResults.find((result) => result.error || !result.success);
    if (failedDelete) {
      await cleanupTempDirs();
      throw new Error(
        `Failed to remove extracted skill ZIP ${failedDelete.path}: ${failedDelete.error?.message ?? 'delete failed'}`
      );
    }

    try {
      await sandbox.moveFiles(
        results.map(({ tempDir, targetDir }) => ({ source: tempDir, destination: targetDir }))
      );
      // 目录重建后清理对应版本的旧初始化标记，确保下次执行重新触发版本 entrypoint。
      const stateContext = await readSandboxRuntimeState({ sandbox });
      const oldEntrypoints = getRuntimeStateValue(
        stateContext.state,
        SKILL_ENTRYPOINT_STATE_LIST_KEY
      );
      if (Array.isArray(oldEntrypoints)) {
        const installedVersionIds = new Set(missingSkills.map(({ versionId }) => versionId));
        const keptEntrypoints = oldEntrypoints.filter((id) => !installedVersionIds.has(id));
        if (keptEntrypoints.length !== oldEntrypoints.length) {
          setRuntimeStateValue(
            stateContext.state,
            SKILL_ENTRYPOINT_STATE_LIST_KEY,
            keptEntrypoints
          );
          await writeSandboxRuntimeState(sandbox, stateContext);
        }
      }
    } catch (error) {
      await Promise.all([
        cleanupTempDirs(),
        sandbox.deleteDirectories(results.map(({ targetDir }) => targetDir)).catch(() => undefined)
      ]);
      throw error;
    }
  }

  return deployableSkills.map(({ skill, version, versionId, targetDir }) => ({
    skillId: String(skill._id),
    name: skill.name,
    description: skill.description || '',
    avatar: skill.avatar,
    versionId,
    targetDir,
    // 入口清单与契约标记；旧导入版本没有 runtimeSkills/契约，运行态回退到全量扫描。
    skillMdPaths: version.runtimeSkills?.map((runtimeSkill) => runtimeSkill.path) ?? [],
    ...(version.skillEntryContract ? { skillEntryContract: version.skillEntryContract } : {})
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
