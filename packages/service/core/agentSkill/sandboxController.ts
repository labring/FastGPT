/**
 * Skill Sandbox Controller
 *
 * Provides core business logic for managing skill sandbox instances.
 *
 */

import { createSandbox } from '@anyany/sandbox_provider';
import type { ISandbox } from '@anyany/sandbox_provider';
import mongoose from 'mongoose';
import { MongoSkillSandbox } from './sandboxSchema';
import { MongoAgentSkills } from './schema';
import { MongoAgentSkillsVersion } from './versionSchema';
import { downloadSkillPackage } from './storage';
import {
  getSandboxProviderConfig,
  getSandboxDefaults,
  validateSandboxConfig,
  buildDockerSyncEnv
} from './sandboxConfig';
import type {
  SkillSandboxSchemaType,
  SandboxImageConfigType,
  SkillSandboxEndpointType
} from '@fastgpt/global/core/agentSkill/type';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkill/constants';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { getLogger, LogCategories } from '../../common/logger';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';

const addLog = getLogger(LogCategories.MODULE.AI.AGENT);

export type CreateEditDebugSandboxParams = {
  skillId: string;
  teamId: string;
  tmbId: string;
  image?: SandboxImageConfigType;
  timeout?: number;
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
  expiresAt?: Date;
};

export type GetSandboxInfoParams = {
  sandboxId: string;
  teamId: string;
};

export type DeleteSandboxParams = {
  sandboxId: string;
  teamId: string;
};

export type RenewSandboxParams = {
  sandboxId: string;
  teamId: string;
  additionalSeconds?: number;
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
  const { skillId, teamId, tmbId, image, timeout, onProgress } = params;

  // === Phase 1: Resolve and validate configuration ===
  const providerConfig = getSandboxProviderConfig();
  const defaults = getSandboxDefaults();
  validateSandboxConfig(providerConfig);

  const sandboxTimeout = timeout || defaults.timeout;
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

  // Check for existing edit-debug sandbox and soft delete it
  const existingSandbox = await MongoSkillSandbox.findOne({
    skillId,
    sandboxType: SandboxTypeEnum.editDebug,
    deleteTime: null
  });

  if (existingSandbox) {
    addLog.info('[Sandbox] Found existing edit-debug sandbox, soft deleting', {
      sandboxId: existingSandbox._id
    });

    existingSandbox.deleteTime = new Date();
    await existingSandbox.save();

    // Async cleanup of provider sandbox (fire and forget)
    cleanupProviderSandbox(existingSandbox.sandbox.sandboxId, providerConfig).catch((err) => {
      addLog.error('[Sandbox] Failed to cleanup old provider sandbox', {
        sandboxId: existingSandbox.sandbox.sandboxId,
        error: err
      });
    });
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

  // === Phase 3: Sandbox operations ===
  let sandbox: ISandbox | null = null;

  try {
    sandbox = createSandbox({
      provider: providerConfig.provider,
      connection: {
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        runtime: providerConfig.runtime
      }
    });

    addLog.info('[Sandbox] Creating sandbox instance', {
      image: sandboxImage,
      timeout: sandboxTimeout
    });

    onProgress?.({ sandboxId: skillId, phase: 'creatingContainer' });
    const sessionId = new mongoose.Types.ObjectId().toHexString();

    if (providerConfig.runtime === 'kubernetes') {
      await sandbox.create({
        image: sandboxImage,
        timeout: sandboxTimeout,
        entrypoint: ['/home/coder/entrypoint.sh'],
        metadata: {
          skillId,
          teamId,
          sandboxType: SandboxTypeEnum.editDebug,
          sessionId
        }
      });
    } else {
      await sandbox.create({
        image: { repository: 'skill-agent/sandbox', tag: 'with-sync' },
        timeout: sandboxTimeout,
        entrypoint: ['/opt/sync-agent/docker-entrypoint.sh'],
        env: buildDockerSyncEnv(sessionId, defaults.workDirectory, true),
        metadata: {
          skillId,
          teamId,
          sandboxType: SandboxTypeEnum.editDebug,
          sessionId
        }
      });
    }

    addLog.info('[Sandbox] Waiting for sandbox to be ready');
    await sandbox.waitUntilReady(60000);

    const sandboxInfo = await sandbox.getInfo();

    addLog.info('[Sandbox] Sandbox created successfully', {
      providerSandboxId: sandboxInfo.id,
      status: sandboxInfo.status.state
    });

    // Upload package to sandbox and extract
    const zipPath = `${defaults.workDirectory}/package.zip`;

    addLog.info('[Sandbox] Uploading package to sandbox', { path: zipPath });

    onProgress?.({ sandboxId: skillId, phase: 'uploadingPackage' });
    await sandbox.writeFiles([
      {
        path: zipPath,
        data: standardizedBuffer
      }
    ]);

    addLog.info('[Sandbox] Extracting package');
    onProgress?.({ sandboxId: skillId, phase: 'extractingPackage' });
    const extractResult = await sandbox.execute(
      `mkdir -p ${defaults.workDirectory} && cd ${defaults.workDirectory} && unzip -o package.zip && rm package.zip`
    );

    if (extractResult.exitCode !== 0) {
      throw new Error(`Failed to extract package: ${extractResult.stderr}`);
    }

    addLog.info('[Sandbox] Package extracted successfully');

    // Get endpoint
    addLog.info('[Sandbox] Getting endpoint', { port: defaults.targetPort });
    const endpoint = await sandbox.getEndpoint(defaults.targetPort);

    const endpointInfo: SkillSandboxEndpointType = {
      host: endpoint.host,
      port: endpoint.port,
      protocol: endpoint.protocol,
      url: endpoint.url
    };

    addLog.info('[Sandbox] Endpoint obtained', endpointInfo);

    // Persist to MongoDB
    const newSandboxDoc = await mongoSessionRun(async (session) => {
      const doc = await MongoSkillSandbox.create(
        [
          {
            _id: sessionId,
            skillId,
            sandboxType: SandboxTypeEnum.editDebug,
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
            },
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
      providerSandboxId: sandboxInfo.id,
      expiresAt: sandboxInfo.expiresAt?.toISOString()
    });

    return {
      sandboxId: newSandboxDoc._id.toString(),
      providerSandboxId: sandboxInfo.id,
      endpoint: endpointInfo,
      status: {
        state: sandboxInfo.status.state,
        message: sandboxInfo.status.message
      },
      expiresAt: sandboxInfo.expiresAt
    };
  } catch (error) {
    addLog.error('[Sandbox] Failed to create sandbox', { error });

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
      await sandbox.close();
    }
  }
}

/**
 * Get sandbox information
 */
export async function getSandboxInfo(
  params: GetSandboxInfoParams
): Promise<SkillSandboxSchemaType> {
  const { sandboxId, teamId } = params;

  const sandbox = await MongoSkillSandbox.findOne({
    _id: sandboxId,
    teamId,
    deleteTime: null
  });

  if (!sandbox) {
    throw new Error('Sandbox not found or access denied');
  }

  // Update last activity time
  sandbox.lastActivityTime = new Date();
  await sandbox.save();

  return sandbox;
}

/**
 * Delete sandbox
 */
export async function deleteSandbox(params: DeleteSandboxParams): Promise<void> {
  const { sandboxId, teamId } = params;

  const sandbox = await MongoSkillSandbox.findOne({
    _id: sandboxId,
    teamId,
    deleteTime: null
  });

  if (!sandbox) {
    throw new Error('Sandbox not found or access denied');
  }

  // Soft delete
  sandbox.deleteTime = new Date();
  await sandbox.save();

  addLog.info('[Sandbox] Sandbox soft deleted', { sandboxId });

  // Async cleanup of provider sandbox
  const providerConfig = getSandboxProviderConfig();
  cleanupProviderSandbox(sandbox.sandbox.sandboxId, providerConfig).catch((err) => {
    addLog.error('[Sandbox] Failed to cleanup provider sandbox', {
      sandboxId: sandbox.sandbox.sandboxId,
      error: err
    });
  });
}

/**
 * Renew sandbox expiration
 */
export async function renewSandboxExpiration(
  params: RenewSandboxParams
): Promise<Date | undefined> {
  const { sandboxId, teamId, additionalSeconds } = params;

  const sandboxDoc = await MongoSkillSandbox.findOne({
    _id: sandboxId,
    teamId,
    deleteTime: null
  });

  if (!sandboxDoc) {
    throw new Error('Sandbox not found or access denied');
  }

  const providerConfig = getSandboxProviderConfig();
  const defaults = getSandboxDefaults();
  const renewSeconds = additionalSeconds || defaults.timeout;

  let sandbox: ISandbox | null = null;

  try {
    sandbox = createSandbox({
      provider: providerConfig.provider,
      connection: {
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        runtime: providerConfig.runtime
      }
    });

    // Connect to existing sandbox
    await sandbox.connect(sandboxDoc.sandbox.sandboxId);

    // Renew expiration
    await sandbox.renewExpiration(renewSeconds);

    // Get updated info
    const updatedInfo = await sandbox.getInfo();

    // Update MongoDB
    sandboxDoc.sandbox.expiresAt = updatedInfo.expiresAt;
    sandboxDoc.lastActivityTime = new Date();
    await sandboxDoc.save();

    addLog.info('[Sandbox] Sandbox expiration renewed', {
      sandboxId,
      expiresAt: updatedInfo.expiresAt
    });

    return updatedInfo.expiresAt;
  } catch (error) {
    addLog.error('[Sandbox] Failed to renew sandbox expiration', { error });
    throw error;
  } finally {
    if (sandbox) {
      await sandbox.close();
    }
  }
}

/**
 * Package skill directory in sandbox
 *
 * Creates a package.zip file containing all files in the sandbox working directory
 *
 * @param params - Parameters for packaging
 * @param params.providerSandboxId - Provider sandbox ID
 * @param params.workDirectory - Working directory (defaults to homeDirectory)
 * @returns Buffer containing the package.zip file
 *
 * @throws Error if packaging fails or file cannot be read
 */
export async function packageSkillInSandbox(params: {
  providerSandboxId: string;
  workDirectory?: string;
}): Promise<Buffer> {
  const { providerSandboxId, workDirectory } = params;

  const providerConfig = getSandboxProviderConfig();
  const defaults = getSandboxDefaults();
  const targetDir = workDirectory || defaults.workDirectory;

  addLog.info('[Sandbox] Packaging skill in sandbox', {
    providerSandboxId,
    workDirectory: targetDir
  });

  let sandbox: ISandbox | null = null;

  try {
    // Create sandbox instance
    sandbox = createSandbox({
      provider: providerConfig.provider,
      connection: {
        apiKey: providerConfig.apiKey,
        baseUrl: providerConfig.baseUrl,
        runtime: providerConfig.runtime
      }
    });

    // Connect to existing sandbox
    await sandbox.connect(providerSandboxId);

    // Execute zip command to package the directory
    // -r: recursive, -x: exclude pattern (exclude package.zip itself)
    const zipCommand = `cd ${targetDir} && zip -r package.zip . -x 'package.zip'`;

    addLog.info('[Sandbox] Executing zip command');

    const zipResult = await sandbox.execute(zipCommand);

    if (zipResult.exitCode !== 0) {
      throw new Error(`Failed to package skill directory: ${zipResult.stderr || zipResult.stdout}`);
    }

    addLog.info('[Sandbox] Zip command executed successfully', {
      stdout: zipResult.stdout
    });

    // Read the generated package.zip file
    const zipFilePath = `${targetDir}/package.zip`;

    addLog.info('[Sandbox] Reading package.zip from sandbox', { path: zipFilePath });

    const files = await sandbox.readFiles([zipFilePath]);

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
      await sandbox.close();
    }
  }
}

/**
 * Cleanup provider sandbox (async helper)
 */
async function cleanupProviderSandbox(
  providerSandboxId: string,
  config: ReturnType<typeof getSandboxProviderConfig>
): Promise<void> {
  let sandbox: ISandbox | null = null;

  try {
    sandbox = createSandbox({
      provider: config.provider,
      connection: {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        runtime: config.runtime
      }
    });

    // Connect to existing sandbox
    await sandbox.connect(providerSandboxId);

    // Delete
    await sandbox.delete();

    addLog.info('[Sandbox] Provider sandbox cleaned up', { providerSandboxId });
  } catch (error) {
    addLog.error('[Sandbox] Error during provider sandbox cleanup', { error });
    throw error;
  } finally {
    if (sandbox) {
      await sandbox.close();
    }
  }
}

/**
 * Find inactive sandboxes for cleanup
 */
export async function findInactiveSandboxes(
  thresholdSeconds?: number
): Promise<SkillSandboxSchemaType[]> {
  const defaults = getSandboxDefaults();
  const threshold = thresholdSeconds || defaults.inactiveThreshold;
  const cutoffTime = new Date(Date.now() - threshold * 1000);

  return await MongoSkillSandbox.find({
    deleteTime: null,
    lastActivityTime: { $lt: cutoffTime }
  });
}
