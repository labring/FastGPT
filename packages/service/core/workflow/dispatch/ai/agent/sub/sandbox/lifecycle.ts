/**
 * Agent Sandbox Lifecycle Management
 *
 * Manages sandbox creation/destruction for agent skill execution.
 *
 * session-runtime 沙箱的数据持久化依赖 sync agent 与 MinIO 的联动：
 * - SESSION_ID 决定 MinIO 存储路径：sessions/{SESSION_ID}/projects/
 * - 沙箱启动时，sync agent 从 MinIO 恢复历史数据
 * - 运行时，文件变更实时同步到 MinIO
 * - 容器销毁后，数据仍保留在 MinIO，下次以相同 SESSION_ID 启动可恢复
 *
 * 沙箱容器生命周期：
 * - createAgentSandbox：优先复用已有容器（查 MongoDB），否则创建新容器并持久化到 MongoDB
 * - releaseAgentSandbox：断开 SDK 连接，更新 lastActivityTime，不销毁容器
 * - 实际容器销毁由 cleanup job 负责（基于 lastActivityTime 超过 inactiveThreshold）
 */

import { createSandbox } from '@anyany/sandbox_provider';
import type { ISandbox } from '@anyany/sandbox_provider';
import type { HydratedDocument } from 'mongoose';
import { MongoAgentSkills } from '../../../../../../agentSkills/schema';
import { MongoSkillSandbox } from '../../../../../../agentSkills/sandboxSchema';
import { MongoAgentSkillsVersion } from '../../../../../../agentSkills/versionSchema';
import { downloadSkillPackage } from '../../../../../../agentSkills/storage';
import { parseSkillMarkdown } from '../../../../../../agentSkills/utils';
import {
  getSandboxProviderConfig,
  getSandboxDefaults,
  validateSandboxConfig,
  buildDockerSyncEnv
} from '../../../../../../agentSkills/sandboxConfig';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import type {
  AgentSkillSchemaType,
  AgentSkillsVersionSchemaType
} from '@fastgpt/global/core/agentSkills/type';
import type { AgentSandboxContext, DeployedSkillInfo } from './types';
import { getLogger, LogCategories } from '../../../../../../../common/logger';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';

type CreateAgentSandboxParams = {
  skillIds: string[];
  teamId: string;
  tmbId: string;
  sessionId: string; // chat 模式 = chatId，debug 模式 = 构造的 key，决定 MinIO 数据路径
  entrypoint?: string; // override default entrypoint for this request
  onProgress?: (status: SandboxStatusItemType) => void; // lifecycle progress callback
};

const logger = getLogger(LogCategories.MODULE.AI.AGENT);

// --- Private helpers ---

type SkillDoc = HydratedDocument<AgentSkillSchemaType>;
type VersionDoc = HydratedDocument<AgentSkillsVersionSchemaType>;
type ProviderConfig = ReturnType<typeof getSandboxProviderConfig>;

/** Build a sandbox SDK instance from the resolved provider config. */
function buildSandboxInstance(providerConfig: ProviderConfig): ISandbox {
  return createSandbox({
    provider: providerConfig.provider,
    connection: {
      apiKey: providerConfig.apiKey,
      baseUrl: providerConfig.baseUrl,
      runtime: providerConfig.runtime
    }
  });
}

/** Query skills and their active versions, returning a map keyed by skillId string. */
async function fetchSkillsWithVersionMap(
  skillIds: string[],
  teamId: string
): Promise<{ skills: SkillDoc[]; versionMap: Map<string, VersionDoc> }> {
  const skills = await MongoAgentSkills.find({
    _id: { $in: skillIds },
    teamId,
    deleteTime: null
  });
  const activeVersions = await MongoAgentSkillsVersion.find({
    skillId: { $in: skills.map((s) => s._id) },
    isActive: true,
    isDeleted: false
  });
  const versionMap = new Map(activeVersions.map((v) => [String(v.skillId), v]));
  return { skills, versionMap };
}

/** Merge an active version snapshot into a skill POJO. Returns skill unchanged when version is absent. */
function mergeSkillWithVersion(
  skill: AgentSkillSchemaType,
  version: VersionDoc | null | undefined
): AgentSkillSchemaType {
  if (!version) return skill;
  return { ...skill };
}

/** Dynamically discover all deployed skill directories in the sandbox by locating SKILL.md files.
 * Example:
 * $ find ${FASTGPT_WORKDIR} -name "SKILL.md" -maxdepth 5 2>/dev/null
 * /home/sandbox/workspace/projects/skill-creator/SKILL.md
 * /home/sandbox/workspace/projects/deep-research/SKILL.md
 * /home/sandbox/workspace/projects/science/SKILL.md
 *
 * Runs `find` inside the sandbox to locate SKILL.md files up to maxdepth 2,
 * then reads each file and parses the frontmatter for name/description.
 * This replaces the pre-scan approach and works with arbitrary ZIP structures.
 */
async function discoverSkillsInSandbox(
  sandbox: ISandbox,
  workDirectory: string
): Promise<DeployedSkillInfo[]> {
  // search 可能存在耗时性能问题，可以引用find命令加上 maxdepth 深度目录约束
  const searchResults = await sandbox.search('SKILL.md', workDirectory);
  if (!searchResults || searchResults.length === 0) return [];

  const paths = searchResults.map((r) => r.path);
  const files = await sandbox.readFiles(paths);

  const result: DeployedSkillInfo[] = [];
  for (const file of files) {
    const content =
      file.content instanceof Uint8Array
        ? new TextDecoder('utf-8').decode(file.content)
        : String(file.content);
    const { frontmatter } = parseSkillMarkdown(content);
    if (!frontmatter.name) continue;
    const directory = file.path.replace(/\/SKILL\.md$/i, '');
    result.push({
      name: String(frontmatter.name),
      description: frontmatter.description ? String(frontmatter.description) : '',
      directory,
      skillMdPath: file.path
    });
  }
  return result;
}

/** Download and extract each skill package into the sandbox work directory. */
async function deploySkillsToSandbox(
  sandbox: ISandbox,
  deployableSkills: SkillDoc[],
  versionMap: Map<string, VersionDoc>,
  workDirectory: string,
  onProgress?: (status: SandboxStatusItemType) => void,
  sessionId?: string
): Promise<void> {
  for (const skill of deployableSkills) {
    const version = versionMap.get(String(skill._id))!;
    onProgress?.({
      sandboxId: sessionId ?? skill._id.toString(),
      phase: 'deployingSkills',
      skillName: skill.name
    });
    try {
      const packageBuffer = await downloadSkillPackage({ storageInfo: version.storage });

      // Write raw ZIP to sandbox and extract in-place (preserves multi-skill directory structure)
      const zipPath = `${workDirectory}/package_${skill.name}.zip`;
      await sandbox.writeFiles([{ path: zipPath, data: packageBuffer }]);

      const extractResult = await sandbox.execute(
        `cd ${workDirectory} && unzip -o package_${skill.name}.zip && rm package_${skill.name}.zip`
      );

      if (extractResult.exitCode !== 0) {
        logger.error('[Agent Sandbox] Failed to extract skill package', {
          skillName: skill.name,
          stderr: extractResult.stderr
        });
      }
    } catch (error) {
      logger.error('[Agent Sandbox] Failed to deploy skill', { skillName: skill.name, error });
    }
  }
}

// --- Exported lifecycle functions ---

/**
 * 创建或复用 session-runtime 沙箱。
 *
 * 优先查询 MongoDB 中是否有相同 sessionId 的活跃容器：
 * - 有 → connect 复用，更新 lastActivityTime，无冷启动
 * - 无 → 创建新容器（注入 SESSION_ID），sync agent 从 MinIO 恢复历史数据，持久化到 MongoDB
 */
export async function createAgentSandbox(
  params: CreateAgentSandboxParams
): Promise<AgentSandboxContext> {
  const { skillIds, teamId, tmbId, sessionId, entrypoint, onProgress } = params;

  const providerConfig = getSandboxProviderConfig();
  const defaults = getSandboxDefaults();
  validateSandboxConfig(providerConfig);

  // Step 1: Try to reuse an existing session-runtime sandbox
  onProgress?.({ sandboxId: sessionId, phase: 'checkExisting' });
  const existingDoc = await MongoSkillSandbox.findOne({
    sessionId,
    sandboxType: SandboxTypeEnum.sessionRuntime,
    deleteTime: null
  });

  if (existingDoc) {
    logger.info('[Agent Sandbox] Reusing existing session-runtime sandbox', {
      sessionId,
      providerSandboxId: existingDoc.sandbox.sandboxId
    });

    onProgress?.({ sandboxId: sessionId, phase: 'connecting', isWarmStart: true });
    const sandbox = buildSandboxInstance(providerConfig);
    await sandbox.connect(existingDoc.sandbox.sandboxId);

    // Refresh the sandbox TTL to prevent expiration mid-session
    if (sandbox.capabilities.supportsRenews) {
      await sandbox.renewExpiration(defaults.timeout);
      const updatedInfo = await sandbox.getInfo();
      if (updatedInfo.expiresAt) {
        existingDoc.sandbox.expiresAt = updatedInfo.expiresAt;
      }
    }

    existingDoc.lastActivityTime = new Date();
    await existingDoc.save();

    const reusedSkillIds = existingDoc.skillIds ? existingDoc.skillIds.map(String) : skillIds;
    const { skills, versionMap } = await fetchSkillsWithVersionMap(reusedSkillIds, teamId);

    onProgress?.({ sandboxId: sessionId, phase: 'ready', isWarmStart: true });
    const mergedSkills = skills.map((skill) =>
      mergeSkillWithVersion(skill.toJSON(), versionMap.get(String(skill._id)))
    );
    // Dynamically discover deployed skills instead of reconstructing from DB name assumptions
    const deployedSkills = await discoverSkillsInSandbox(sandbox, defaults.workDirectory);
    return {
      sandbox,
      providerSandboxId: existingDoc.sandbox.sandboxId,
      sessionId,
      skills: mergedSkills,
      deployedSkills,
      workDirectory: defaults.workDirectory,
      isReady: true
    };
  }

  // Step 2: Fetch skills and filter deployable ones
  logger.info('[Agent Sandbox] Creating new session-runtime sandbox', {
    skillIds,
    teamId,
    sessionId
  });

  onProgress?.({ sandboxId: sessionId, phase: 'fetchSkills', isWarmStart: false });
  const { skills, versionMap } = await fetchSkillsWithVersionMap(skillIds, teamId);

  if (skills.length === 0) {
    throw new Error('No valid skills found');
  }

  const deployableSkills = skills.filter(
    (skill) => versionMap.get(String(skill._id)) && skill.currentStorage
  );

  if (deployableSkills.length === 0) {
    throw new Error('No deployable skills found (missing active versions)');
  }

  // Step 3: Create sandbox container, inject SESSION_ID
  let sandbox: ISandbox | null = null;

  try {
    sandbox = buildSandboxInstance(providerConfig);

    onProgress?.({ sandboxId: sessionId, phase: 'creatingContainer', isWarmStart: false });
    if (providerConfig.runtime === 'kubernetes') {
      await sandbox.create({
        image: defaults.defaultImage,
        timeout: defaults.timeout,
        entrypoint: [entrypoint ?? defaults.entrypoint.sessionKubernetes],
        env: buildDockerSyncEnv(sessionId, defaults.workDirectory, false),
        metadata: {
          teamId,
          tmbId,
          sandboxType: SandboxTypeEnum.sessionRuntime,
          skillIds: skillIds.join('-'),
          sessionId
        }
      });
    } else {
      // Docker 模式：通过环境变量注入 SESSION_ID，sync agent 据此确定 MinIO 数据路径
      await sandbox.create({
        image: { repository: 'fastgpt-agent-sandbox', tag: 'docker' },
        timeout: defaults.timeout,
        entrypoint: [entrypoint ?? defaults.entrypoint.docker],
        env: buildDockerSyncEnv(sessionId, defaults.workDirectory, false),
        metadata: {
          teamId,
          tmbId,
          sandboxType: SandboxTypeEnum.sessionRuntime,
          skillIds: skillIds.join('-'),
          sessionId
        }
      });
    }

    await sandbox.waitUntilReady(60000);

    const sandboxInfo = await sandbox.getInfo();

    logger.info('[Agent Sandbox] Sandbox created', {
      providerSandboxId: sandboxInfo.id,
      sessionId
    });

    // Step 4: Deploy skill packages, then dynamically discover skills in sandbox
    await deploySkillsToSandbox(
      sandbox,
      deployableSkills,
      versionMap,
      defaults.workDirectory,
      onProgress,
      sessionId
    );
    const deployedSkills = await discoverSkillsInSandbox(sandbox, defaults.workDirectory);

    // Step 5: Persist to MongoDB
    await MongoSkillSandbox.create({
      skillId: deployableSkills[0]._id, // 保留 required 字段兼容性
      skillIds: deployableSkills.map((s) => s._id),
      sessionId,
      sandboxType: SandboxTypeEnum.sessionRuntime,
      teamId,
      tmbId,
      sandbox: {
        provider: providerConfig.provider,
        sandboxId: sandboxInfo.id,
        image: sandboxInfo.image,
        status: {
          state: sandboxInfo.status.state,
          message: sandboxInfo.status.message,
          reason: sandboxInfo.status.reason
        },
        createdAt: sandboxInfo.createdAt,
        expiresAt: sandboxInfo.expiresAt
      }
    });

    logger.info('[Agent Sandbox] Sandbox info saved to MongoDB', { sessionId });

    onProgress?.({ sandboxId: sessionId, phase: 'ready', isWarmStart: false });
    return {
      sandbox,
      providerSandboxId: sandboxInfo.id,
      sessionId,
      skills: deployableSkills.map((skill) =>
        mergeSkillWithVersion(skill.toJSON(), versionMap.get(String(skill._id))!)
      ),
      deployedSkills,
      workDirectory: defaults.workDirectory,
      isReady: true
    };
  } catch (error) {
    logger.error('[Agent Sandbox] Failed to create sandbox', { error });

    if (sandbox) {
      try {
        await sandbox.delete();
      } catch (cleanupError) {
        logger.error('[Agent Sandbox] Cleanup failed after creation error', { cleanupError });
      }
      await sandbox.close();
    }

    throw error;
  }
}

/**
 * 结束本次 sandbox 使用。
 *
 * 只断开 SDK 连接并更新 lastActivityTime，不销毁容器。
 * 容器保持存活，供同会话的下一次 agent 调用复用。
 * 实际容器销毁由 cleanup job 在超过 inactiveThreshold 后执行。
 */
export async function releaseAgentSandbox(ctx: AgentSandboxContext): Promise<void> {
  try {
    await ctx.sandbox.close();
    logger.info('[Agent Sandbox] Released sandbox connection', {
      sessionId: ctx.sessionId,
      providerSandboxId: ctx.providerSandboxId
    });
  } catch (error) {
    logger.error('[Agent Sandbox] Failed to close sandbox connection', { error });
  }

  // 更新 lastActivityTime，cleanup job 据此判断是否超时
  try {
    await MongoSkillSandbox.updateOne(
      { sessionId: ctx.sessionId, sandboxType: SandboxTypeEnum.sessionRuntime, deleteTime: null },
      { $set: { lastActivityTime: new Date() } }
    );
  } catch (error) {
    logger.error('[Agent Sandbox] Failed to update lastActivityTime', { error });
  }
}

type ConnectEditDebugSandboxParams = {
  skillId: string;
  teamId: string;
};

/**
 * 连接已有的 editDebug 沙箱，构建 AgentSandboxContext。
 * 用于 test 模式下，复用编辑中的沙箱进行调试。
 */
export async function connectEditDebugSandbox(
  params: ConnectEditDebugSandboxParams
): Promise<AgentSandboxContext> {
  const { skillId, teamId } = params;
  const providerConfig = getSandboxProviderConfig();
  const defaults = getSandboxDefaults();
  validateSandboxConfig(providerConfig);

  const sandboxDoc = await MongoSkillSandbox.findOne({
    skillId,
    sandboxType: SandboxTypeEnum.editDebug,
    deleteTime: null
  });
  if (!sandboxDoc) {
    throw new Error('No active edit-debug sandbox found for this skill');
  }

  const skill = await MongoAgentSkills.findOne({
    _id: skillId,
    teamId,
    deleteTime: null
  });
  if (!skill) {
    throw new Error('Skill not found');
  }

  const sandbox = buildSandboxInstance(providerConfig);
  await sandbox.connect(sandboxDoc.sandbox.sandboxId);

  sandboxDoc.lastActivityTime = new Date();
  await sandboxDoc.save();

  logger.info('[Agent Sandbox] Connected to edit-debug sandbox', {
    skillId,
    providerSandboxId: sandboxDoc.sandbox.sandboxId
  });

  // Dynamically discover deployed skills instead of reading from persisted metadata
  const deployedSkills = await discoverSkillsInSandbox(sandbox, defaults.workDirectory);

  return {
    sandbox,
    providerSandboxId: sandboxDoc.sandbox.sandboxId,
    sessionId: String(sandboxDoc._id), // editDebug 沙箱用自身 _id 作为 sessionId
    skills: [skill.toJSON()],
    deployedSkills,
    workDirectory: defaults.workDirectory,
    isReady: true
  };
}

/**
 * 只断开连接，不销毁沙箱。
 */
export async function disconnectEditDebugSandbox(ctx: AgentSandboxContext): Promise<void> {
  try {
    await ctx.sandbox.close();
    logger.info('[Agent Sandbox] Disconnected from edit-debug sandbox', {
      providerSandboxId: ctx.providerSandboxId
    });
  } catch (error) {
    logger.error('[Agent Sandbox] Failed to disconnect from edit-debug sandbox', { error });
  }
}
