/**
 * Agent Sandbox Lifecycle Management
 *
 * Manages sandbox creation/destruction for agent skill execution.
 *
 * 沙箱容器生命周期：
 * - createAgentSandbox：优先复用已有容器（查 MongoDB），否则创建新容器并持久化到 MongoDB
 * - releaseAgentSandbox：断开 SDK 连接，不销毁容器
 */

import type { ISandbox, OpenSandboxVolume } from '@fastgpt-sdk/sandbox-adapter';
import type { HydratedDocument } from 'mongoose';
import { MongoAgentSkills } from '../../../../../../agentSkills/schema';
import { MongoSandboxInstance } from '../../../../../../ai/sandbox/schema';
import { MongoAgentSkillsVersion } from '../../../../../../agentSkills/version/schema';
import { downloadSkillPackage } from '../../../../../../agentSkills/storage';
import { parseSkillMarkdown } from '../../../../../../agentSkills/utils';
import {
  getSandboxProviderConfig,
  getSandboxDefaults,
  validateSandboxConfig,
  buildSandboxAdapter,
  connectToProviderSandbox,
  disconnectFromProviderSandbox,
  getVolumeManagerConfig,
  ensureSessionVolume,
  buildVolumeConfig,
  buildBaseContainerEnv
} from '../../../../../../agentSkills/sandboxConfig';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { env } from '../../../../../../../env';
import type {
  AgentSkillSchemaType,
  AgentSkillsVersionSchemaType,
  SandboxImageConfigType
} from '@fastgpt/global/core/agentSkills/type';
import type { AgentSandboxContext, DeployedSkillInfo } from './types';
import { getLogger, LogCategories } from '../../../../../../../common/logger';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';

type CreateAgentSandboxParams = {
  skillIds: string[];
  teamId: string;
  tmbId: string;
  sessionId: string; // chat 模式 = chatId，debug 模式 = 构造的 key
  entrypoint?: string; // override default entrypoint for this request
  image?: SandboxImageConfigType; // override default image for this request
  onProgress?: (status: SandboxStatusItemType) => void; // lifecycle progress callback
};

const logger = getLogger(LogCategories.MODULE.AI.AGENT);

// --- Private helpers ---

type SkillDoc = HydratedDocument<AgentSkillSchemaType>;
type VersionDoc = HydratedDocument<AgentSkillsVersionSchemaType>;
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
 * Runs `find` inside the sandbox to locate SKILL.md files up to maxdepth 5,
 * then reads each file and parses the frontmatter for name/description.
 * This replaces the pre-scan approach and works with arbitrary ZIP structures.
 */
async function discoverSkillsInSandbox(
  sandbox: ISandbox,
  workDirectory: string
): Promise<DeployedSkillInfo[]> {
  // Use `find` with -maxdepth 5 to avoid deep recursion performance issues.
  const findResult = await sandbox.execute(
    `find "${workDirectory}" -name "SKILL.md" -maxdepth 5 2>/dev/null`
  );
  if (findResult.exitCode !== 0 || !findResult.stdout.trim()) return [];

  const paths = findResult.stdout.trim().split('\n').filter(Boolean);
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
      id: file.path,
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
    const sandboxId = sessionId ?? skill._id.toString();
    onProgress?.({
      sandboxId,
      phase: 'deployingSkills',
      skillName: skill.name
    });
    try {
      onProgress?.({ sandboxId, phase: 'downloadingPackage', skillName: skill.name });
      const packageBuffer = await downloadSkillPackage({ storageInfo: version.storage });

      // Write raw ZIP to sandbox and extract directly into workDirectory.
      const zipPath = `${workDirectory}/package_${skill.name}.zip`;
      onProgress?.({ sandboxId, phase: 'uploadingPackage', skillName: skill.name });
      await sandbox.writeFiles([{ path: zipPath, data: packageBuffer }]);

      onProgress?.({ sandboxId, phase: 'extractingPackage', skillName: skill.name });
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
 * - 有 → connect 复用，无冷启动
 * - 无 → 创建新容器，挂载会话 Volume，持久化到 MongoDB
 */
export async function createAgentSandbox(
  params: CreateAgentSandboxParams
): Promise<AgentSandboxContext> {
  const { skillIds, teamId, tmbId, sessionId, entrypoint, image, onProgress } = params;

  const providerConfig = getSandboxProviderConfig();
  const defaults = getSandboxDefaults();
  validateSandboxConfig(providerConfig);

  // Step 1: Try to reuse an existing session-runtime sandbox
  onProgress?.({ sandboxId: sessionId, phase: 'checkExisting' });
  const existingInstance = await MongoSandboxInstance.findOne({
    chatId: sessionId,
    'metadata.sandboxType': SandboxTypeEnum.sessionRuntime
  });

  if (existingInstance) {
    logger.info('[Agent Sandbox] Reusing existing session-runtime sandbox', {
      sessionId,
      providerSandboxId: existingInstance.sandboxId
    });

    onProgress?.({ sandboxId: sessionId, phase: 'connecting', isWarmStart: true });
    const sandbox = await connectToProviderSandbox(providerConfig, existingInstance.sandboxId);

    if (existingInstance.status === SandboxStatusEnum.stopped) {
      logger.info('[Agent Sandbox] Resuming stopped sandbox', {
        sessionId,
        providerSandboxId: existingInstance.sandboxId
      });
      await sandbox.start();
      await sandbox.waitUntilReady(60000);
    }

    await MongoSandboxInstance.updateOne(
      { _id: existingInstance._id },
      { lastActiveAt: new Date() }
    );

    const reusedSkillIds = existingInstance.metadata?.skillIds
      ? existingInstance.metadata.skillIds.map(String)
      : skillIds;
    const { skills, versionMap } = await fetchSkillsWithVersionMap(reusedSkillIds, teamId);

    onProgress?.({ sandboxId: sessionId, phase: 'ready', isWarmStart: true });
    const mergedSkills = skills.map((skill) =>
      mergeSkillWithVersion(skill.toJSON(), versionMap.get(String(skill._id)))
    );
    // Dynamically discover deployed skills instead of reconstructing from DB name assumptions
    const deployedSkills = await discoverSkillsInSandbox(sandbox, defaults.workDirectory);
    return {
      sandbox,
      providerSandboxId: existingInstance.sandboxId,
      sessionId,
      skills: mergedSkills,
      deployedSkills,
      workDirectory: defaults.workDirectory,
      isReady: true
    };
  }

  // Step 2: Fetch skills and filter deployable ones (skip when no skills configured)
  logger.info('[Agent Sandbox] Creating new session-runtime sandbox', {
    skillIds,
    teamId,
    sessionId
  });

  const hasSkills = skillIds.length > 0;
  let deployableSkills: SkillDoc[] = [];
  let versionMap = new Map<string, VersionDoc>();

  if (hasSkills) {
    onProgress?.({ sandboxId: sessionId, phase: 'fetchSkills', isWarmStart: false });
    const result = await fetchSkillsWithVersionMap(skillIds, teamId);

    if (result.skills.length === 0) {
      throw new Error('No valid skills found');
    }

    deployableSkills = result.skills.filter(
      (skill) => result.versionMap.get(String(skill._id)) && skill.currentStorage
    );
    versionMap = result.versionMap;

    if (deployableSkills.length === 0) {
      throw new Error('No deployable skills found (missing active versions)');
    }
  }

  // Check active session-runtime sandbox count limit
  const maxSessionRuntime =
    global.feConfigs?.limit?.agentSandboxMaxSessionRuntime ?? env.AGENT_SANDBOX_MAX_SESSION_RUNTIME;
  if (maxSessionRuntime !== undefined) {
    const activeCount = await MongoSandboxInstance.countDocuments({
      status: SandboxStatusEnum.running,
      'metadata.sandboxType': SandboxTypeEnum.sessionRuntime
    });
    if (activeCount >= maxSessionRuntime) {
      const message = `Active session-runtime sandbox limit reached (${activeCount}/${maxSessionRuntime}). Please try again later.`;
      onProgress?.({ sandboxId: sessionId, phase: 'failed', message });
      throw new Error(message);
    }
  }

  // Step 3: Create sandbox container, inject SESSION_ID
  let sandbox: ISandbox | null = null;

  try {
    const createEntrypoint = defaults.entrypoint;

    let volumes: OpenSandboxVolume[] | undefined;
    if (providerConfig.provider === 'opensandbox' && env.AGENT_SANDBOX_ENABLE_VOLUME) {
      const vmConfig = getVolumeManagerConfig();
      const claimName = await ensureSessionVolume(sessionId, vmConfig);
      volumes = [
        buildVolumeConfig(providerConfig.runtime, sessionId, claimName, vmConfig.mountPath)
      ];
    }

    const createConfig = {
      image: image ?? defaults.defaultImage,
      entrypoint: [entrypoint ?? createEntrypoint],
      env: buildBaseContainerEnv(sessionId, defaults.workDirectory, false),
      volumes,
      metadata: {
        teamId,
        tmbId,
        sandboxType: SandboxTypeEnum.sessionRuntime,
        skillIds: skillIds.join('-'),
        sessionId
      }
    };

    sandbox = buildSandboxAdapter(providerConfig, {
      providerSandboxId: sessionId,
      createConfig
    });

    onProgress?.({ sandboxId: sessionId, phase: 'creatingContainer', isWarmStart: false });
    await sandbox.create();

    await sandbox.waitUntilReady(60000);

    const sandboxInfo = await sandbox.getInfo();
    if (!sandboxInfo) throw new Error('Failed to get sandbox info after creation');

    logger.info('[Agent Sandbox] Sandbox created', {
      providerSandboxId: sandboxInfo.id,
      sessionId
    });

    // Step 4: Deploy skill packages (only when skills are configured)
    if (hasSkills) {
      await deploySkillsToSandbox(
        sandbox,
        deployableSkills,
        versionMap,
        defaults.workDirectory,
        onProgress,
        sessionId
      );
    }
    const deployedSkills = hasSkills
      ? await discoverSkillsInSandbox(sandbox, defaults.workDirectory)
      : [];

    // Step 5: Persist to MongoDB
    await MongoSandboxInstance.create({
      provider: providerConfig.provider,
      sandboxId: sandboxInfo.id,
      appId: teamId, // session-runtime uses teamId as appId
      userId: tmbId,
      chatId: sessionId,
      status: SandboxStatusEnum.running,
      lastActiveAt: new Date(),
      createdAt: new Date(),
      metadata: {
        sandboxType: SandboxTypeEnum.sessionRuntime,
        teamId,
        tmbId,
        sessionId,
        skillIds: hasSkills ? deployableSkills.map((s) => s._id) : [],
        provider: providerConfig.provider,
        image: sandboxInfo.image,
        providerStatus: {
          state: sandboxInfo.status.state,
          message: sandboxInfo.status.message,
          reason: sandboxInfo.status.reason
        },
        providerCreatedAt: sandboxInfo.createdAt
      }
    });

    logger.info('[Agent Sandbox] Sandbox info saved to MongoDB', { sessionId });

    onProgress?.({ sandboxId: sessionId, phase: 'ready', isWarmStart: false });
    return {
      sandbox,
      providerSandboxId: sandboxInfo.id,
      sessionId,
      skills: hasSkills
        ? deployableSkills.map((skill) =>
            mergeSkillWithVersion(skill.toJSON(), versionMap.get(String(skill._id))!)
          )
        : [],
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
      await disconnectFromProviderSandbox(sandbox);
    }

    throw error;
  }
}

/**
 * 结束本次 sandbox 使用。
 *
 * 只断开 SDK 连接，不销毁容器。
 * 容器保持存活，供同会话的下一次 agent 调用复用。
 */
export async function releaseAgentSandbox(ctx: AgentSandboxContext): Promise<void> {
  try {
    await disconnectFromProviderSandbox(ctx.sandbox);
    logger.info('[Agent Sandbox] Released sandbox connection', {
      sessionId: ctx.sessionId,
      providerSandboxId: ctx.providerSandboxId
    });
  } catch (error) {
    logger.error('[Agent Sandbox] Failed to close sandbox connection', { error });
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

  const instanceDoc = await MongoSandboxInstance.findOne({
    appId: skillId,
    chatId: 'edit-debug',
    'metadata.sandboxType': SandboxTypeEnum.editDebug
  });
  if (!instanceDoc) {
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

  const sandbox = await connectToProviderSandbox(providerConfig, instanceDoc.sandboxId);

  await MongoSandboxInstance.updateOne({ _id: instanceDoc._id }, { lastActiveAt: new Date() });

  logger.info('[Agent Sandbox] Connected to edit-debug sandbox', {
    skillId,
    providerSandboxId: instanceDoc.sandboxId
  });

  // Dynamically discover deployed skills instead of reading from persisted metadata
  const deployedSkills = await discoverSkillsInSandbox(sandbox, defaults.workDirectory);

  return {
    sandbox,
    providerSandboxId: instanceDoc.sandboxId,
    sessionId: String(instanceDoc._id), // editDebug sandbox uses its own _id as sessionId
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
    await disconnectFromProviderSandbox(ctx.sandbox);
    logger.info('[Agent Sandbox] Disconnected from edit-debug sandbox', {
      providerSandboxId: ctx.providerSandboxId
    });
  } catch (error) {
    logger.error('[Agent Sandbox] Failed to disconnect from edit-debug sandbox', { error });
  }
}
