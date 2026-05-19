/**
 * Skill Sandbox Controller
 *
 * Provides core business logic for managing skill sandbox instances.
 *
 */

import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { MongoAgentSkills } from './schema';
import { MongoAgentSkillsVersion } from './version/schema';
import { downloadSkillPackage } from './storage';
import {
  getSkillSizeLimits,
  EDIT_DEBUG_SANDBOX_CHAT_ID,
  getEditDebugSandboxId,
  buildEditDebugCreateConfig
} from './sandboxConfig';
import { getSandboxDefaults } from '../ai/sandbox/config';
import { getSandboxProviderConfig, validateSandboxConfig } from '../ai/sandbox/config';
import type {
  SandboxInstanceSchemaType,
  SandboxImageConfigType,
  SkillSandboxEndpointType
} from '@fastgpt/global/core/agentSkills/type';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import {
  connectReadySandboxByInstance,
  connectToSandbox,
  disconnectSandbox,
  getReadySandboxInfo,
  getSandboxEndpoint,
  SandboxClient,
  getSandboxClient
} from '../ai/sandbox/controller';
import {
  countRunningSandboxInstancesByType,
  deleteSandboxInstanceRecord,
  findSandboxInstanceByAppChatType,
  findSandboxInstanceBySandboxIdAndTeam,
  findSandboxResourcesByAppChatTypeExcludeProvider,
  findSandboxResourceBySandboxIdAndTeam,
  findSkillRelatedSandboxResources,
  updateSandboxInstanceEndpoint,
  updateSandboxInstanceRecordBySandboxId
} from '../ai/sandbox/instance';
import { getLogger, LogCategories } from '../../common/logger';
import { serviceEnv } from '../../env';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';

const addLog = getLogger(LogCategories.MODULE.AI.AGENT);

export type CreateEditDebugSandboxParams = {
  skillId: string;
  teamId: string;
  tmbId: string;
  image?: SandboxImageConfigType;
  entrypoint?: string; // override default entrypoint for this request
  onProgress?: (status: SandboxStatusItemType) => void; // lifecycle progress callback
};

export type CreateEditDebugSandboxResult = {
  sandboxId: string;
  endpoint: SkillSandboxEndpointType;
  status: {
    state: string;
    message?: string;
  };
};

export type GetSandboxInfoParams = {
  sandboxId: string;
  teamId: string;
};

export type DeleteSandboxParams = {
  sandboxId: string;
  teamId: string;
};

/**
 * Create an edit-debug sandbox for a skill
 *
 * Process:
 * Phase 1 - Resolve and validate configuration
 * Phase 2 - Pre-flight checks and resource preparation (auth, package download)
 * Phase 3 - Sandbox operations (create, upload, extract, persist)
 */
export async function createEditDebugSandbox(
  params: CreateEditDebugSandboxParams
): Promise<CreateEditDebugSandboxResult> {
  const { skillId, teamId, tmbId, image, entrypoint, onProgress } = params;

  // === Phase 1: Resolve and validate configuration ===
  const providerConfig = getSandboxProviderConfig();
  const defaults = getSandboxDefaults();
  validateSandboxConfig(providerConfig);

  const sandboxImage = image || defaults.defaultImage;

  addLog.info('[Sandbox] Creating edit-debug sandbox', {
    skillId,
    teamId,
    image: sandboxImage
  });

  // === Phase 2: Pre-flight checks and resource preparation ===

  // Verify skill exists and user has permission
  const skill = await MongoAgentSkills.findOne({
    _id: skillId,
    teamId,
    deleteTime: null
  });

  if (!skill) {
    throw new Error('Skill not found or access denied');
  }

  if (!skill.currentStorage) {
    throw new Error('Skill package not found - no current version available');
  }

  // Verify active version exists
  const activeVersion = await MongoAgentSkillsVersion.findOne({
    skillId,
    isActive: true,
    isDeleted: false
  });

  if (!activeVersion) {
    throw new Error('No active version found for skill');
  }

  const sessionId = getEditDebugSandboxId(skillId);

  // Check for existing sandbox instance by skillId
  const existingInstance = await findSandboxInstanceByAppChatType({
    provider: providerConfig.provider,
    appId: skillId,
    chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
    type: SandboxTypeEnum.editDebug
  });

  const reuseExistingEditDebugSandbox = async (
    instance: NonNullable<typeof existingInstance>
  ): Promise<CreateEditDebugSandboxResult | null> => {
    addLog.info('[Sandbox] Found existing sandbox instance, ensuring running', {
      instanceId: instance._id,
      sandboxId: instance.sandboxId
    });

    let sandbox: ISandbox | null = null;

    try {
      onProgress?.({ sandboxId: instance.sandboxId, phase: 'creatingContainer' });

      const connected = await connectReadySandboxByInstance(providerConfig, instance);
      sandbox = connected.sandbox;

      const endpointInfo = await getSandboxEndpoint(sandbox);

      // Update endpoint and normalize edit-debug root keys in DB.
      await updateSandboxInstanceEndpoint({ instanceId: instance._id, endpoint: endpointInfo });
      await updateSandboxInstanceRecordBySandboxId({
        provider: providerConfig.provider,
        sandboxId: instance.sandboxId,
        appId: skillId,
        userId: '',
        chatId: EDIT_DEBUG_SANDBOX_CHAT_ID
      });

      onProgress?.({
        sandboxId: instance.sandboxId,
        phase: 'ready',
        endpoint: endpointInfo
      });

      return {
        sandboxId: instance.sandboxId,
        endpoint: endpointInfo,
        status: { state: 'Running' }
      };
    } catch (error) {
      addLog.info('[Sandbox] Existing sandbox is unavailable, recreating edit-debug sandbox', {
        sandboxId: instance.sandboxId,
        error
      });

      await deleteSandboxInstanceRecord(instance._id);
      return null;
    } finally {
      if (sandbox) {
        await disconnectSandbox(sandbox);
      }
    }
  };

  if (existingInstance) {
    const reusedSandbox = await reuseExistingEditDebugSandbox(existingInstance);
    if (reusedSandbox) return reusedSandbox;
  }

  // 当前 provider 没有可复用实例时，旧 provider 的同业务记录会被
  // { appId, chatId } 唯一索引挡住创建；先清理旧记录再 upsert 当前 provider。
  const staleProviderInstances = await findSandboxResourcesByAppChatTypeExcludeProvider({
    provider: providerConfig.provider,
    appId: skillId,
    chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
    type: SandboxTypeEnum.editDebug
  });
  if (staleProviderInstances.length > 0) {
    addLog.info('[Sandbox] Removing stale edit-debug sandbox records for inactive provider', {
      skillId,
      provider: providerConfig.provider,
      staleProviders: staleProviderInstances.map((item) => item.provider)
    });
    await Promise.all(
      staleProviderInstances.map(async (instance) => {
        await SandboxClient.deleteResource(instance).catch((error) => {
          addLog.error('[Sandbox] Failed to delete stale provider sandbox resource', {
            sandboxId: instance.sandboxId,
            provider: instance.provider,
            error
          });
        });
        await deleteSandboxInstanceRecord(instance._id);
      })
    );
  }

  // Check active edit-debug sandbox count limit
  const maxEditDebug =
    global.feConfigs?.limit?.agentSandboxMaxEditDebug ?? serviceEnv.AGENT_SANDBOX_MAX_EDIT_DEBUG;
  if (maxEditDebug !== undefined) {
    const activeCount = await countRunningSandboxInstancesByType(
      SandboxTypeEnum.editDebug,
      providerConfig.provider
    );
    if (activeCount >= maxEditDebug) {
      const message = `Active edit-debug sandbox limit reached (${activeCount}/${maxEditDebug}). Please try again later.`;
      onProgress?.({ sandboxId: sessionId, phase: 'failed', message });
      throw new Error(message);
    }
  }

  // === Phase 3: Sandbox operations ===
  let sandbox: ISandbox | null = null;
  let sandboxClient: SandboxClient | null = null;

  try {
    onProgress?.({ sandboxId: sessionId, phase: 'downloadingPackage' });
    const packageBuffer = await downloadSkillPackage({
      storageInfo: activeVersion.storage
    });

    // Package is already in ZIP format from import time.
    const standardizedBuffer = packageBuffer;

    onProgress?.({ sandboxId: sessionId, phase: 'creatingContainer' });

    // getSandboxClient handles volumes internally (via getVolumeManagerConfig) and calls
    // provider.ensureRunning() which creates the container when it doesn't exist
    const createConfig = buildEditDebugCreateConfig({
      providerConfig,
      sessionId,
      sandboxImage,
      defaults,
      entrypoint,
      skillId,
      teamId
    });
    const client = await getSandboxClient(
      {
        appId: skillId,
        userId: '',
        chatId: EDIT_DEBUG_SANDBOX_CHAT_ID
      },
      {
        createConfig
      }
    );
    sandboxClient = client;
    sandbox = client.provider;

    const sandboxInfo = await getReadySandboxInfo(client.provider, {
      sandboxId: sessionId,
      image: createConfig.image ?? sandboxImage,
      entrypoint: createConfig.entrypoint,
      status: client.provider.status
    });

    // Upload package to sandbox and extract
    const zipPath = `${defaults.workDirectory}/package.zip`;

    onProgress?.({ sandboxId: sessionId, phase: 'uploadingPackage' });
    await client.provider.writeFiles([
      {
        path: zipPath,
        data: standardizedBuffer
      }
    ]);

    onProgress?.({ sandboxId: sessionId, phase: 'extractingPackage' });
    const extractResult = await client.provider.execute(
      `mkdir -p ${defaults.workDirectory} && cd ${defaults.workDirectory} && unzip -o package.zip && rm package.zip`
    );

    if (extractResult.exitCode !== 0) {
      throw new Error(`Failed to extract package: ${extractResult.stderr}`);
    }

    // Get code-server endpoint
    const endpointInfo = await getSandboxEndpoint(client.provider);

    // Enrich the DB record created by getSandboxClient.ensureAvailable() with full skill metadata.
    // Use sessionId (the client-side key) because ensureAvailable() stores the record with
    // sandboxId=sessionId, not with the provider-assigned sandboxInfo.id.
    const newSandboxDoc = await updateSandboxInstanceRecordBySandboxId({
      provider: providerConfig.provider,
      sandboxId: sessionId,
      appId: skillId,
      userId: '',
      chatId: EDIT_DEBUG_SANDBOX_CHAT_ID,
      type: SandboxTypeEnum.editDebug,
      metadata: {
        teamId,
        tmbId,
        skillId,
        sessionId,
        provider: providerConfig.provider,
        image: sandboxInfo.image,
        providerCreatedAt: sandboxInfo.createdAt,
        endpoint: endpointInfo,
        storage: {
          bucket: activeVersion.storage.bucket,
          key: activeVersion.storage.key,
          size: standardizedBuffer.length,
          uploadedAt: new Date()
        },
        metadata: new Map([
          ['skillName', skill.name],
          ['version', activeVersion.version.toString()]
        ])
      }
    });

    if (!newSandboxDoc) throw new Error('Failed to find sandbox document after creation');

    onProgress?.({
      sandboxId: sessionId,
      phase: 'ready',
      endpoint: endpointInfo
    });

    return {
      sandboxId: sessionId,
      endpoint: endpointInfo,
      status: {
        state: sandboxInfo.status.state,
        message: sandboxInfo.status.message
      }
    };
  } catch (error) {
    addLog.error('[Sandbox] Failed to create sandbox', {
      error,
      rawBody: (error as any)?.cause?.rawBody ?? (error as any)?.rawBody
    });

    // sandboxClient.delete() cleans up: provider container + session volume + DB record
    if (sandboxClient) {
      try {
        await sandboxClient.delete();
        // Prevent finally from trying to disconnect an already-deleted sandbox
        sandbox = null;
      } catch (cleanupError) {
        addLog.error('[Sandbox] Failed to cleanup sandbox after error', { cleanupError });
      }
    }

    throw error;
  } finally {
    if (sandbox) {
      await disconnectSandbox(sandbox);
    }
  }
}
export async function getSandboxInfo(
  params: GetSandboxInfoParams
): Promise<SandboxInstanceSchemaType> {
  const { sandboxId, teamId } = params;

  const providerConfig = getSandboxProviderConfig();
  const sandbox = await findSandboxInstanceBySandboxIdAndTeam({
    provider: providerConfig.provider,
    sandboxId,
    teamId
  });

  if (!sandbox) {
    throw new Error('Sandbox not found or access denied');
  }

  return sandbox as unknown as SandboxInstanceSchemaType;
}

/**
 * Delete sandbox
 */
export async function deleteSandbox(params: DeleteSandboxParams): Promise<void> {
  const { sandboxId, teamId } = params;

  const providerConfig = getSandboxProviderConfig();
  const instanceDoc = await findSandboxResourceBySandboxIdAndTeam({
    provider: providerConfig.provider,
    sandboxId,
    teamId
  });

  if (!instanceDoc) {
    throw new Error('Sandbox not found or access denied');
  }

  addLog.info('[Sandbox] Deleting sandbox', { sandboxId });

  await SandboxClient.deleteResource(instanceDoc);
}

/**
 * Force delete all sandbox instances related to the given skill IDs
 * Called when a skill is deleted to clean up provider resources
 */
export async function deleteSkillRelatedSandboxes(skillIds: string[]): Promise<void> {
  if (skillIds.length === 0) return;

  // Find all sandbox instances related to these skills
  const instances = await findSkillRelatedSandboxResources(skillIds);

  if (instances.length === 0) return;

  addLog.info('[Sandbox] Force deleting skill-related sandboxes', {
    skillIds,
    count: instances.length
  });

  await Promise.allSettled(
    instances.map(async (doc) => {
      await SandboxClient.deleteResource(doc);
    })
  );
}

/**
 * Package skill directory in sandbox
 *
 * Creates a package.zip file containing all files in the sandbox working directory
 *
 * @param params - Parameters for packaging
 * @param params.sandboxId - FastGPT sandbox ID
 * @param params.workDirectory - Working directory
 * @returns Buffer containing the package.zip file
 *
 * @throws Error if packaging fails, file cannot be read, or directory exceeds size limit
 */
export async function packageSkillInSandbox(params: {
  sandboxId: string;
  workDirectory?: string;
}): Promise<Buffer> {
  const { sandboxId, workDirectory } = params;
  const { maxSandboxPackageBytes: maxBytes } = getSkillSizeLimits();

  const providerConfig = getSandboxProviderConfig();
  const defaults = getSandboxDefaults();
  const targetDir = workDirectory || defaults.workDirectory;

  let sandbox: ISandbox | null = null;

  try {
    const newSandbox = await connectToSandbox(providerConfig, sandboxId);
    sandbox = newSandbox;

    // Fast path: check directory size before expensive zip operation
    // Use 'find -ls | awk' instead of 'du' for better portability:
    // 'du' reports disk-block usage and its flags (-sb, --bytes) differ across GNU coreutils,
    // busybox (Alpine), and BSD; 'find -ls' is POSIX and outputs per-file byte sizes in $7
    // uniformly across all those environments.
    const sizeCheckCmd = `find ${targetDir} -type f ! -name 'package.zip' -ls 2>/dev/null | awk '{s+=$7} END {print s+0}'`;
    const sizeResult = await newSandbox.execute(sizeCheckCmd);

    if (sizeResult.exitCode === 0 && sizeResult.stdout.trim()) {
      const dirBytes = parseInt(sizeResult.stdout.trim(), 10);
      if (!isNaN(dirBytes) && dirBytes > maxBytes) {
        throw new Error(
          `Skill directory size (${(dirBytes / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${maxBytes / 1024 / 1024}MB)`
        );
      }
    }

    // Zip workDirectory directly so the deployed package keeps the workspace file tree.
    const zipCommand = `cd ${targetDir} && zip -r package.zip . -x 'package.zip'`;

    const zipResult = await newSandbox.execute(zipCommand);

    if (zipResult.exitCode !== 0) {
      throw new Error(`Failed to package skill directory: ${zipResult.stderr || zipResult.stdout}`);
    }

    // Read the generated package.zip file
    const zipFilePath = `${targetDir}/package.zip`;

    const files = await newSandbox.readFiles([zipFilePath]);

    if (!files || files.length === 0) {
      throw new Error('Package file not found in sandbox');
    }

    // Clean up the zip file after reading to free sandbox storage
    await newSandbox.execute(`rm -f "${zipFilePath}"`);

    const content = files[0].content;
    return Buffer.from(content instanceof Uint8Array ? content : Buffer.from(content, 'utf-8'));
  } catch (error) {
    addLog.error('[Sandbox] Failed to package skill', {
      sandboxId,
      error
    });
    throw error;
  } finally {
    if (sandbox) {
      await disconnectSandbox(sandbox);
    }
  }
}
