/**
 * Agent Sandbox Lifecycle Management
 *
 * Manages sandbox creation/destruction for agent skill execution.
 *
 * 沙箱容器生命周期：
 * - createAgentSandbox：优先复用已有容器（查 MongoDB），否则创建新容器并持久化到 MongoDB
 * - releaseAgentSandbox：断开 SDK 连接，不销毁容器
 */

import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import type { HydratedDocument } from 'mongoose';
import { MongoAgentSkills } from '../../../../../../agentSkills/schema';
import { MongoSandboxInstance } from '../../../../../../ai/sandbox/schema';
import { MongoAgentSkillsVersion } from '../../../../../../agentSkills/version/schema';
import { downloadSkillPackage } from '../../../../../../agentSkills/storage';
import { parseSkillMarkdown } from '../../../../../../agentSkills/utils';
import {
  getSandboxDefaults,
  EDIT_DEBUG_SANDBOX_CHAT_ID,
  buildSessionRuntimeCreateConfig
} from '../../../../../../agentSkills/sandboxConfig';
import {
  getSandboxProviderConfig,
  validateSandboxConfig
} from '../../../../../../ai/sandbox/config';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import {
  connectReadySandboxByInstance,
  disconnectSandbox,
  SandboxClient,
  getSandboxClient
} from '../../../../../../ai/sandbox/controller';
import {
  deleteSandboxInstanceRecord,
  findSandboxResourcesByAppChatTypeExcludeProvider
} from '../../../../../../ai/sandbox/instance';
import { serviceEnv } from '../../../../../../../env';
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
  sessionId: string; // FastGPT 侧稳定 sandbox id，由 app/user/chat hash 生成。
  entrypoint?: string; // override default entrypoint for this request
  image?: SandboxImageConfigType; // override default image for this request
  onProgress?: (status: SandboxStatusItemType) => void; // lifecycle progress callback
};

const logger = getLogger(LogCategories.MODULE.AI.AGENT);

// --- Private helpers ---

type SkillDoc = HydratedDocument<AgentSkillSchemaType>;
type VersionDoc = HydratedDocument<AgentSkillsVersionSchemaType>;

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

export function getSkillWorkspaceDirName(skill: { _id?: unknown; id?: unknown; name: string }) {
  const dirName = skill.name
    .trim()
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\\/]/g, '-')
    .trim()
    .slice(0, 80);

  if (dirName && dirName !== '.' && dirName !== '..') return dirName;
  return `skill-${String(skill._id ?? skill.id ?? 'package').slice(-8)}`;
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
  const skillIdOrder = new Map(skillIds.map((id, index) => [String(id), index]));
  skills.sort(
    (a, b) =>
      (skillIdOrder.get(String(a._id)) ?? Number.MAX_SAFE_INTEGER) -
      (skillIdOrder.get(String(b._id)) ?? Number.MAX_SAFE_INTEGER)
  );
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
 * $ find ${FASTGPT_WORKDIR} -iname "SKILL.md" 2>/dev/null
 * /home/sandbox/workspace/projects/skill-creator/SKILL.md
 * /home/sandbox/workspace/projects/deep-research/SKILL.md
 * /home/sandbox/workspace/projects/science/SKILL.md
 *
 * Runs `find` inside the sandbox to locate SKILL.md files recursively, then reads each
 * file and parses the frontmatter for name/description.
 * This replaces the pre-scan approach and works with arbitrary ZIP structures.
 */
async function discoverSkillsInSandbox(
  sandbox: ISandbox,
  workDirectory: string
): Promise<DeployedSkillInfo[]> {
  const findResult = await sandbox.execute(
    `find ${shellQuote(workDirectory)} -iname "SKILL.md" 2>/dev/null`
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

      // Write raw ZIP to sandbox and extract under the outer skill workspace directory.
      const zipFileName = `package_${String(skill._id)}.zip`;
      const zipPath = `${workDirectory}/${zipFileName}`;
      const targetDir = `${workDirectory}/${getSkillWorkspaceDirName(skill)}`;
      onProgress?.({ sandboxId, phase: 'uploadingPackage', skillName: skill.name });
      await sandbox.writeFiles([{ path: zipPath, data: packageBuffer }]);

      onProgress?.({ sandboxId, phase: 'extractingPackage', skillName: skill.name });
      const extractResult = await sandbox.execute(
        buildExtractSkillPackageCommand({
          workDirectory,
          targetDir,
          zipFileName
        })
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

export function buildExtractSkillPackageCommand({
  workDirectory,
  targetDir,
  zipFileName
}: {
  workDirectory: string;
  targetDir: string;
  zipFileName: string;
}) {
  return `mkdir -p ${shellQuote(targetDir)} && cd ${shellQuote(targetDir)} && unzip -o ${shellQuote(
    `../${zipFileName}`
  )} && rm ${shellQuote(`${workDirectory}/${zipFileName}`)}`;
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
  const createConfig = buildSessionRuntimeCreateConfig({
    providerConfig,
    sessionId,
    defaults,
    entrypoint,
    image,
    teamId,
    tmbId,
    skillIds
  });

  // Step 1: Try to reuse an existing session-runtime sandbox
  onProgress?.({ sandboxId: sessionId, phase: 'checkExisting' });
  const sessionRuntimeQuery = {
    provider: providerConfig.provider,
    sandboxId: sessionId,
    'metadata.sandboxType': SandboxTypeEnum.sessionRuntime
  };
  const existingInstance = await MongoSandboxInstance.findOne(sessionRuntimeQuery);

  const reuseSessionRuntimeSandbox = async (
    instance: NonNullable<typeof existingInstance>
  ): Promise<AgentSandboxContext | null> => {
    logger.info('[Agent Sandbox] Reusing existing session-runtime sandbox', {
      sessionId,
      sandboxId: instance.sandboxId
    });

    onProgress?.({ sandboxId: sessionId, phase: 'connecting', isWarmStart: true });

    let sandbox: ISandbox | null = null;

    try {
      const connected = await connectReadySandboxByInstance(providerConfig, instance);
      sandbox = connected.sandbox;
      await MongoSandboxInstance.updateOne(
        { _id: instance._id },
        {
          $set: {
            status: SandboxStatusEnum.running,
            lastActiveAt: new Date()
          }
        }
      );
    } catch (error) {
      logger.info('[Agent Sandbox] Existing session-runtime sandbox is unavailable, recreating', {
        sessionId,
        sandboxId: instance.sandboxId,
        error
      });
      await MongoSandboxInstance.deleteOne({ _id: instance._id });
      return null;
    }

    const reusedSkillIds = instance.metadata?.skillIds
      ? instance.metadata.skillIds.map(String)
      : skillIds;
    const { skills, versionMap } = await fetchSkillsWithVersionMap(reusedSkillIds, teamId);

    onProgress?.({ sandboxId: sessionId, phase: 'ready', isWarmStart: true });
    const mergedSkills = skills.map((skill) =>
      mergeSkillWithVersion(skill.toJSON(), versionMap.get(String(skill._id)))
    );
    const deployedSkills = await discoverSkillsInSandbox(sandbox, defaults.workDirectory);
    return {
      sandbox,
      provider: providerConfig.provider,
      sandboxId: instance.sandboxId,
      sessionId,
      skills: mergedSkills,
      deployedSkills,
      workDirectory: defaults.workDirectory,
      isReady: true
    };
  };

  if (existingInstance) {
    const reusedSandbox = await reuseSessionRuntimeSandbox(existingInstance);
    if (reusedSandbox) return reusedSandbox;
  }

  // 当前 provider 没有可复用实例时，旧 provider 的同业务 session-runtime
  // 记录会被 { appId, chatId } 唯一索引挡住后续 metadata 补写。
  const staleProviderInstances = await findSandboxResourcesByAppChatTypeExcludeProvider({
    provider: providerConfig.provider,
    appId: teamId,
    chatId: sessionId,
    sandboxType: SandboxTypeEnum.sessionRuntime
  });
  if (staleProviderInstances.length > 0) {
    logger.info('[Agent Sandbox] Removing stale session-runtime records for inactive provider', {
      teamId,
      sessionId,
      provider: providerConfig.provider,
      staleProviders: staleProviderInstances.map((item) => item.provider)
    });
    await Promise.all(
      staleProviderInstances.map(async (instance) => {
        await SandboxClient.deleteResource(instance).catch((error) => {
          logger.error('[Agent Sandbox] Failed to delete stale provider sandbox resource', {
            sandboxId: instance.sandboxId,
            provider: instance.provider,
            error
          });
        });
        await deleteSandboxInstanceRecord(instance._id);
      })
    );
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
    global.feConfigs?.limit?.agentSandboxMaxSessionRuntime ??
    serviceEnv.AGENT_SANDBOX_MAX_SESSION_RUNTIME;
  if (maxSessionRuntime !== undefined) {
    const activeCount = await MongoSandboxInstance.countDocuments({
      provider: providerConfig.provider,
      status: SandboxStatusEnum.running,
      'metadata.sandboxType': SandboxTypeEnum.sessionRuntime
    });
    if (activeCount >= maxSessionRuntime) {
      const message = `Active session-runtime sandbox limit reached (${activeCount}/${maxSessionRuntime}). Please try again later.`;
      onProgress?.({ sandboxId: sessionId, phase: 'failed', message });
      throw new Error(message);
    }
  }

  // Step 3: Create sandbox container via getSandboxClient (handles volumes internally)
  let sandboxClient: SandboxClient | null = null;

  try {
    onProgress?.({ sandboxId: sessionId, phase: 'creatingContainer', isWarmStart: false });

    // getSandboxClient handles volumes internally (via getVolumeManagerConfig) and calls
    // provider.ensureRunning() which creates the container when it doesn't exist
    const client = await getSandboxClient(
      { sandboxId: sessionId },
      {
        // volumes: handled internally by getSandboxClient via getVolumeManagerConfig
        createConfig
      }
    );
    sandboxClient = client;

    const sandboxInfo = await client.provider.getInfo();
    if (!sandboxInfo) throw new Error('Failed to get sandbox info after creation');

    logger.info('[Agent Sandbox] Sandbox created', {
      sandboxId: sessionId,
      sessionId
    });

    // Step 4: Deploy skill packages (only when skills are configured)
    if (hasSkills) {
      await deploySkillsToSandbox(
        client.provider,
        deployableSkills,
        versionMap,
        defaults.workDirectory,
        onProgress,
        sessionId
      );
    }
    const deployedSkills = hasSkills
      ? await discoverSkillsInSandbox(client.provider, defaults.workDirectory)
      : [];

    // Step 5: Enrich the DB record created by getSandboxClient.ensureAvailable() with full metadata.
    // Use sessionId (the client-side key) because ensureAvailable() stores the record with
    // sandboxId=sessionId, not with the provider-assigned sandboxInfo.id.
    const savedInstance = await MongoSandboxInstance.findOneAndUpdate(
      { provider: providerConfig.provider, sandboxId: sessionId },
      {
        $set: {
          appId: teamId, // session-runtime uses teamId as appId
          userId: tmbId,
          chatId: sessionId,
          metadata: {
            sandboxType: SandboxTypeEnum.sessionRuntime,
            teamId,
            tmbId,
            sessionId,
            skillIds: hasSkills ? deployableSkills.map((s) => String(s._id)) : [],
            provider: providerConfig.provider,
            image: sandboxInfo.image,
            providerCreatedAt: sandboxInfo.createdAt
          }
        }
      }
    );
    if (!savedInstance) {
      throw new Error('Failed to find session-runtime sandbox document after creation');
    }

    logger.info('[Agent Sandbox] Sandbox info saved to MongoDB', { sessionId });

    onProgress?.({ sandboxId: sessionId, phase: 'ready', isWarmStart: false });
    return {
      sandbox: client.provider,
      provider: providerConfig.provider,
      sandboxId: sessionId,
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

    if (sandboxClient) {
      try {
        // sandboxClient.delete() cleans up: provider container + session volume + DB record
        await sandboxClient.delete();
      } catch (cleanupError) {
        logger.error('[Agent Sandbox] Cleanup failed after creation error', { cleanupError });
      }
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
    await disconnectSandbox(ctx.sandbox);
    logger.info('[Agent Sandbox] Released sandbox connection', {
      sessionId: ctx.sessionId,
      sandboxId: ctx.sandboxId
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
  const defaults = getSandboxDefaults();
  const providerConfig = getSandboxProviderConfig();

  const editDebugQuery = {
    provider: providerConfig.provider,
    appId: skillId,
    chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
    'metadata.sandboxType': SandboxTypeEnum.editDebug
  };
  const instanceDoc = await MongoSandboxInstance.findOne(editDebugQuery);

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

  const connected = await connectReadySandboxByInstance(providerConfig, instanceDoc);
  const { sandbox } = connected;
  await MongoSandboxInstance.updateOne(
    { _id: instanceDoc._id },
    {
      $set: {
        status: SandboxStatusEnum.running,
        lastActiveAt: new Date()
      }
    }
  );

  logger.info('[Agent Sandbox] Connected to edit-debug sandbox', {
    skillId,
    sandboxId: instanceDoc.sandboxId
  });

  // Dynamically discover deployed skills instead of reading from persisted metadata
  const deployedSkills = await discoverSkillsInSandbox(sandbox, defaults.workDirectory);

  return {
    sandbox,
    provider: providerConfig.provider,
    sandboxId: instanceDoc.sandboxId,
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
    await disconnectSandbox(ctx.sandbox);
    logger.info('[Agent Sandbox] Disconnected from edit-debug sandbox', {
      sandboxId: ctx.sandboxId
    });
  } catch (error) {
    logger.error('[Agent Sandbox] Failed to disconnect from edit-debug sandbox', { error });
  }
}
