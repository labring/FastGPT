/**
 * Skill Sandbox Controller
 *
 * Provides core business logic for managing skill sandbox instances.
 *
 */

import type { ISandbox, OpenSandboxVolume } from '@fastgpt-sdk/sandbox-adapter';
import mongoose from 'mongoose';
import { MongoSandboxInstance } from '../ai/sandbox/schema';
import { MongoAgentSkills } from './schema';
import { MongoAgentSkillsVersion } from './version/schema';
import { downloadSkillPackage } from './storage';
import {
  getSandboxProviderConfig,
  getSandboxDefaults,
  validateSandboxConfig,
  getSkillSizeLimits,
  buildSandboxAdapter,
  connectToProviderSandbox,
  disconnectFromProviderSandbox,
  getProviderSandboxEndpoint,
  getVolumeManagerConfig,
  ensureSessionVolume,
  buildVolumeConfig,
  buildBaseContainerEnv
} from './sandboxConfig';
import type {
  SandboxInstanceSchemaType,
  SandboxImageConfigType,
  SkillSandboxEndpointType
} from '@fastgpt/global/core/agentSkills/type';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxClient } from '../ai/sandbox/controller';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { getLogger, LogCategories } from '../../common/logger';
import { env } from '../../env';
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
  providerSandboxId: string;
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

  // chat ID used for all edit-debug sandbox instances
  const EDIT_DEBUG_CHAT_ID = 'edit-debug';

  // Check for existing sandbox instance by skillId
  const existingInstance = await MongoSandboxInstance.findOne({
    appId: skillId,
    chatId: EDIT_DEBUG_CHAT_ID,
    'metadata.sandboxType': SandboxTypeEnum.editDebug
  });

  if (existingInstance?.status === SandboxStatusEnum.running) {
    // Reuse running sandbox - return stored endpoint directly
    addLog.info('[Sandbox] Found running sandbox instance, reusing', {
      instanceId: existingInstance._id,
      sandboxId: existingInstance.sandboxId
    });

    const endpointInfo = existingInstance.metadata!.endpoint!;

    await MongoSandboxInstance.updateOne(
      { _id: existingInstance._id },
      { lastActiveAt: new Date() }
    );

    onProgress?.({
      sandboxId: skillId,
      phase: 'ready',
      endpoint: endpointInfo,
      providerSandboxId: existingInstance.sandboxId
    });

    return {
      sandboxId: existingInstance._id.toString(),
      providerSandboxId: existingInstance.sandboxId,
      endpoint: endpointInfo,
      status: {
        state: existingInstance.metadata!.providerStatus!.state,
        message: existingInstance.metadata!.providerStatus!.message
      }
    };
  }

  if (existingInstance?.status === SandboxStatusEnum.stopped) {
    // Resume stopped sandbox
    addLog.info('[Sandbox] Found stopped sandbox instance, resuming', {
      instanceId: existingInstance._id,
      sandboxId: existingInstance.sandboxId
    });

    let resumeSandboxAdapter: ISandbox | null = null;
    try {
      const newAdapter = await connectToProviderSandbox(providerConfig, existingInstance.sandboxId);
      resumeSandboxAdapter = newAdapter;

      onProgress?.({ sandboxId: skillId, phase: 'creatingContainer' });
      await newAdapter.start();
      await newAdapter.waitUntilReady(60000);

      const endpointInfo = await getProviderSandboxEndpoint(newAdapter, defaults.targetPort);

      await MongoSandboxInstance.updateOne(
        { _id: existingInstance._id },
        {
          status: SandboxStatusEnum.running,
          lastActiveAt: new Date(),
          'metadata.endpoint': endpointInfo,
          'metadata.providerStatus': { state: 'Running' }
        }
      );

      onProgress?.({
        sandboxId: skillId,
        phase: 'ready',
        endpoint: endpointInfo,
        providerSandboxId: existingInstance.sandboxId
      });

      return {
        sandboxId: existingInstance._id.toString(),
        providerSandboxId: existingInstance.sandboxId,
        endpoint: endpointInfo,
        status: { state: 'Running' }
      };
    } catch (error) {
      addLog.error('[Sandbox] Failed to resume stopped sandbox', { error });
      throw error;
    } finally {
      if (resumeSandboxAdapter) {
        await disconnectFromProviderSandbox(resumeSandboxAdapter);
      }
    }
  }

  // Download package.zip from MinIO and standardize it
  addLog.info('[Sandbox] Downloading package from storage', {
    key: activeVersion.storage.key
  });

  onProgress?.({ sandboxId: skillId, phase: 'downloadingPackage' });
  const packageBuffer = await downloadSkillPackage({
    storageInfo: activeVersion.storage
  });

  addLog.info('[Sandbox] Package downloaded', { size: packageBuffer.length });

  // Package is already in ZIP format from import time.
  const standardizedBuffer = packageBuffer;

  // Check active edit-debug sandbox count limit
  const maxEditDebug =
    global.feConfigs?.limit?.agentSandboxMaxEditDebug ?? env.AGENT_SANDBOX_MAX_EDIT_DEBUG;
  if (maxEditDebug !== undefined) {
    const activeCount = await MongoSandboxInstance.countDocuments({
      status: SandboxStatusEnum.running,
      'metadata.sandboxType': SandboxTypeEnum.editDebug
    });
    if (activeCount >= maxEditDebug) {
      const message = `Active edit-debug sandbox limit reached (${activeCount}/${maxEditDebug}). Please try again later.`;
      onProgress?.({ sandboxId: skillId, phase: 'failed', message });
      throw new Error(message);
    }
  }

  // === Phase 3: Sandbox operations ===
  let sandbox: ISandbox | null = null;

  try {
    addLog.info('[Sandbox] Creating sandbox instance', {
      image: sandboxImage
    });

    onProgress?.({ sandboxId: skillId, phase: 'creatingContainer' });
    const sessionId = new mongoose.Types.ObjectId().toHexString();

    const createEntrypoint = defaults.entrypoint;

    let volumes: OpenSandboxVolume[] | undefined;
    if (providerConfig.provider === 'opensandbox' && env.AGENT_SANDBOX_ENABLE_VOLUME) {
      const vmConfig = getVolumeManagerConfig();
      const claimName = await ensureSessionVolume(sessionId, vmConfig);
      volumes = [
        buildVolumeConfig(providerConfig.runtime, sessionId, claimName, vmConfig.mountPath)
      ];
    }

    const newSandbox = buildSandboxAdapter(providerConfig, {
      providerSandboxId: sessionId,
      createConfig: {
        image: sandboxImage,
        entrypoint: [entrypoint ?? createEntrypoint],
        env: buildBaseContainerEnv(sessionId, defaults.workDirectory, true),
        volumes,
        metadata: {
          skillId,
          teamId,
          sandboxType: SandboxTypeEnum.editDebug,
          sessionId
        }
      }
    });
    sandbox = newSandbox; // keep outer ref for finally cleanup

    await newSandbox.create();

    addLog.info('[Sandbox] Waiting for sandbox to be ready');
    await newSandbox.waitUntilReady(60000);
    const sandboxInfo = await newSandbox.getInfo();
    if (!sandboxInfo) throw new Error('Failed to get sandbox info after creation');

    // Upload package to sandbox and extract
    const zipPath = `${defaults.workDirectory}/package.zip`;

    addLog.info('[Sandbox] Uploading package to sandbox', { path: zipPath });

    onProgress?.({ sandboxId: skillId, phase: 'uploadingPackage' });
    await newSandbox.writeFiles([
      {
        path: zipPath,
        data: standardizedBuffer
      }
    ]);

    addLog.info('[Sandbox] Extracting package');
    onProgress?.({ sandboxId: skillId, phase: 'extractingPackage' });
    const extractResult = await newSandbox.execute(
      `mkdir -p ${defaults.workDirectory} && cd ${defaults.workDirectory} && unzip -o package.zip && rm package.zip`
    );

    if (extractResult.exitCode !== 0) {
      throw new Error(`Failed to extract package: ${extractResult.stderr}`);
    }

    addLog.info('[Sandbox] Package extracted successfully');

    // Get endpoint
    addLog.info('[Sandbox] Getting endpoint', { port: defaults.targetPort });
    const endpointInfo = await getProviderSandboxEndpoint(newSandbox, defaults.targetPort);

    addLog.info('[Sandbox] Endpoint obtained', endpointInfo);

    // Persist to MongoDB
    const newSandboxDoc = await mongoSessionRun(async (session) => {
      const doc = await MongoSandboxInstance.create(
        [
          {
            provider: providerConfig.provider,
            sandboxId: sandboxInfo.id,
            appId: skillId,
            userId: tmbId,
            chatId: EDIT_DEBUG_CHAT_ID,
            status: SandboxStatusEnum.running,
            lastActiveAt: new Date(),
            createdAt: new Date(),
            metadata: {
              sandboxType: SandboxTypeEnum.editDebug,
              teamId,
              tmbId,
              skillId,
              provider: providerConfig.provider,
              image: sandboxInfo.image,
              providerStatus: {
                state: sandboxInfo.status.state,
                message: sandboxInfo.status.message,
                reason: sandboxInfo.status.reason
              },
              providerCreatedAt: sandboxInfo.createdAt,
              endpoint: endpointInfo,
              storage: {
                bucket: activeVersion.storage.bucket,
                key: activeVersion.storage.key,
                size: standardizedBuffer.length,
                uploadedAt: new Date()
              },
              skillName: skill.name,
              skillVersion: activeVersion.version.toString()
            }
          }
        ],
        { session }
      );

      return doc[0];
    });

    addLog.info('[Sandbox] Sandbox info saved to database', {
      sandboxId: newSandboxDoc._id
    });

    onProgress?.({
      sandboxId: skillId,
      phase: 'ready',
      endpoint: endpointInfo,
      providerSandboxId: sandboxInfo.id
    });

    return {
      sandboxId: newSandboxDoc._id.toString(),
      providerSandboxId: sandboxInfo.id,
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

    // Cleanup provider sandbox if it was created
    if (sandbox) {
      try {
        await sandbox.delete();
      } catch (cleanupError) {
        addLog.error('[Sandbox] Failed to cleanup sandbox after error', { cleanupError });
      }
    }

    throw error;
  } finally {
    if (sandbox) {
      await disconnectFromProviderSandbox(sandbox);
    }
  }
}
export async function getSandboxInfo(
  params: GetSandboxInfoParams
): Promise<SandboxInstanceSchemaType> {
  const { sandboxId, teamId } = params;

  const sandbox = await MongoSandboxInstance.findOne({
    _id: sandboxId,
    'metadata.teamId': teamId
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

  const instanceDoc = await MongoSandboxInstance.findOne({
    _id: sandboxId,
    'metadata.teamId': teamId
  });

  if (!instanceDoc) {
    throw new Error('Sandbox not found or access denied');
  }

  addLog.info('[Sandbox] Deleting sandbox', { sandboxId });

  new SandboxClient({ sandboxId: instanceDoc.sandboxId }).delete().catch((err) => {
    addLog.error('[Sandbox] Failed to delete sandbox', {
      sandboxId: instanceDoc.sandboxId,
      error: err
    });
  });
}

/**
 * Force delete all sandbox instances related to the given skill IDs
 * Called when a skill is deleted to clean up provider resources
 */
export async function deleteSkillRelatedSandboxes(skillIds: string[]): Promise<void> {
  if (skillIds.length === 0) return;

  // Find all sandbox instances related to these skills
  const instances = await MongoSandboxInstance.find({
    $or: [{ appId: { $in: skillIds } }, { 'metadata.skillId': { $in: skillIds } }]
  }).lean();

  if (instances.length === 0) return;

  addLog.info('[Sandbox] Force deleting skill-related sandboxes', {
    skillIds,
    count: instances.length
  });

  await Promise.allSettled(
    instances.map((doc) =>
      new SandboxClient({ sandboxId: doc.sandboxId }).delete().catch((err) => {
        addLog.error('[Sandbox] Failed to delete sandbox', {
          sandboxId: doc.sandboxId,
          error: err
        });
      })
    )
  );
}

/**
 * Package skill directory in sandbox
 *
 * Creates a package.zip file containing all files in the sandbox working directory
 *
 * @param params - Parameters for packaging
 * @param params.providerSandboxId - Provider sandbox ID
 * @param params.workDirectory - Working directory
 * @returns Buffer containing the package.zip file
 *
 * @throws Error if packaging fails, file cannot be read, or directory exceeds size limit
 */
export async function packageSkillInSandbox(params: {
  providerSandboxId: string;
  workDirectory?: string;
}): Promise<Buffer> {
  const { providerSandboxId, workDirectory } = params;
  const { maxSandboxPackageBytes: maxBytes } = getSkillSizeLimits();

  const providerConfig = getSandboxProviderConfig();
  const defaults = getSandboxDefaults();
  const targetDir = workDirectory || defaults.workDirectory;

  addLog.info('[Sandbox] Packaging skill in sandbox', {
    providerSandboxId,
    workDirectory: targetDir
  });

  let sandbox: ISandbox | null = null;

  try {
    const newSandbox = await connectToProviderSandbox(providerConfig, providerSandboxId);
    sandbox = newSandbox;

    // Fast path: check directory size before expensive zip operation
    // Use 'find -ls | awk' instead of 'du' for better portability:
    // 'du' reports disk-block usage and its flags (-sb, --bytes) differ across GNU coreutils,
    // busybox (Alpine), and BSD; 'find -ls' is POSIX and outputs per-file byte sizes in $7
    // uniformly across all those environments.
    const sizeCheckCmd = `find ${targetDir} -type f ! -name 'package.zip' -ls 2>/dev/null | awk '{s+=$7} END {print s+0}'`;
    addLog.info('[Sandbox] Checking directory size before packaging');
    const sizeResult = await newSandbox.execute(sizeCheckCmd);

    if (sizeResult.exitCode === 0 && sizeResult.stdout.trim()) {
      const dirBytes = parseInt(sizeResult.stdout.trim(), 10);
      if (!isNaN(dirBytes) && dirBytes > maxBytes) {
        throw new Error(
          `Skill directory size (${(dirBytes / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${maxBytes / 1024 / 1024}MB)`
        );
      }
      addLog.info('[Sandbox] Directory size check passed', {
        dirBytes,
        maxBytes
      });
    }

    // Zip workDirectory directly so that archive entries are {skill-name}/...
    // keeping the same structure expected by validateZipStructure.
    const zipCommand = `cd ${targetDir} && zip -r package.zip . -x 'package.zip'`;

    addLog.info('[Sandbox] Executing zip command');

    const zipResult = await newSandbox.execute(zipCommand);

    if (zipResult.exitCode !== 0) {
      throw new Error(`Failed to package skill directory: ${zipResult.stderr || zipResult.stdout}`);
    }

    addLog.info('[Sandbox] Zip command executed successfully', {
      stdout: zipResult.stdout
    });

    // Read the generated package.zip file
    const zipFilePath = `${targetDir}/package.zip`;

    addLog.info('[Sandbox] Reading package.zip from sandbox', { path: zipFilePath });

    const files = await newSandbox.readFiles([zipFilePath]);

    if (!files || files.length === 0) {
      throw new Error('Package file not found in sandbox');
    }

    addLog.info('[Sandbox] Package read successfully', {
      size: files[0].content.length
    });

    const content = files[0].content;
    return Buffer.from(content instanceof Uint8Array ? content : Buffer.from(content, 'utf-8'));
  } catch (error) {
    addLog.error('[Sandbox] Failed to package skill', {
      providerSandboxId,
      error
    });
    throw error;
  } finally {
    if (sandbox) {
      await disconnectFromProviderSandbox(sandbox);
    }
  }
}
