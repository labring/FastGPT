/**
 * Skill Sandbox Controller
 *
 * Provides core business logic for managing skill sandbox instances.
 *
 */

import { createSandbox } from '@anyany/sandbox_provider';
import type { ISandbox } from '@anyany/sandbox_provider';
import { MongoSkillSandbox } from './sandboxSchema';
import { MongoAgentSkill } from './schema';
import { MongoSkillVersion } from './versionSchema';
import { downloadSkillPackage } from './storage';
import { standardizeSkillPackage } from './zipBuilder';
import {
  getSandboxProviderConfig,
  getSandboxDefaults,
  validateSandboxConfig
} from './sandboxConfig';
import type {
  SkillSandboxSchemaType,
  SandboxImageConfigType,
  SkillSandboxEndpointType
} from '@fastgpt/global/core/agentSkill/type';
import { SandboxTypeEnum } from '@fastgpt/global/core/agentSkill/constants';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { addLog } from '../../common/system/log';

export type CreateEditDebugSandboxParams = {
  skillId: string;
  teamId: string;
  tmbId: string;
  image?: SandboxImageConfigType;
  timeout?: number;
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
 * 1. Verify skillId exists and user has permission
 * 2. Check for existing edit-debug sandbox and soft delete it
 * 3. Create sandbox using sandbox_provider
 * 4. Download package.zip from MinIO
 * 5. Upload and extract to sandbox
 * 6. Get endpoint information
 * 7. Save to MongoDB
 */
export async function createEditDebugSandbox(
  params: CreateEditDebugSandboxParams
): Promise<CreateEditDebugSandboxResult> {
  const { skillId, teamId, tmbId, image, timeout } = params;

  // Get configuration
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

  // Step 1: Verify skill exists and get its version info
  const skill = await MongoAgentSkill.findOne({
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

  // Get active version to ensure we have package.zip
  const activeVersion = await MongoSkillVersion.findOne({
    skillId,
    isActive: true,
    isDeleted: false
  });

  if (!activeVersion) {
    throw new Error('No active version found for skill');
  }

  // Step 2: Check for existing edit-debug sandbox and soft delete
  const existingSandbox = await MongoSkillSandbox.findOne({
    skillId,
    sandboxType: SandboxTypeEnum.editDebug,
    deleteTime: null
  });

  if (existingSandbox) {
    addLog.info('[Sandbox] Found existing edit-debug sandbox, soft deleting', {
      sandboxId: existingSandbox._id
    });

    // Soft delete
    existingSandbox.deleteTime = new Date();
    await existingSandbox.save();

    // Async cleanup of provider sandbox (don't wait)
    cleanupProviderSandbox(existingSandbox.sandbox.sandboxId, providerConfig).catch((err) => {
      addLog.error('[Sandbox] Failed to cleanup old provider sandbox', {
        sandboxId: existingSandbox.sandbox.sandboxId,
        error: err
      });
    });
  }

  // Step 3: Create sandbox using sandbox_provider
  let sandbox: ISandbox | null = null;
  let newSandboxDoc: SkillSandboxSchemaType | null = null;

  try {
    sandbox = createSandbox({
      provider: 'opensandbox',
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

    await sandbox.create({
      image: sandboxImage,
      timeout: sandboxTimeout,
      entrypoint: ['/home/coder/entrypoint.sh'],
      metadata: {
        skillId,
        teamId,
        sandboxType: SandboxTypeEnum.editDebug
      }
    });

    // Step 4: Wait for sandbox to be ready
    addLog.info('[Sandbox] Waiting for sandbox to be ready');
    await sandbox.waitUntilReady(60000); // 60 second timeout

    // Get sandbox info
    const sandboxInfo = await sandbox.getInfo();

    addLog.info('[Sandbox] Sandbox created successfully', {
      providerSandboxId: sandboxInfo.id,
      status: sandboxInfo.status.state
    });

    // Step 5: Download package.zip from MinIO
    addLog.info('[Sandbox] Downloading package from storage', {
      key: activeVersion.storage.key
    });

    const packageBuffer = await downloadSkillPackage({
      storageInfo: activeVersion.storage
    });

    addLog.info('[Sandbox] Package downloaded', { size: packageBuffer.length });

    // Standardize the ZIP package (ensure root folder named after skill)
    const { buffer: standardizedBuffer } = await standardizeSkillPackage(packageBuffer, skill.name);

    // Step 6: Upload to sandbox and extract
    const zipPath = `${defaults.workDirectory}/package.zip`;

    addLog.info('[Sandbox] Uploading package to sandbox', { path: zipPath });

    await sandbox.writeFiles([
      {
        path: zipPath,
        data: standardizedBuffer
      }
    ]);

    // Extract the package
    addLog.info('[Sandbox] Extracting package');
    const extractResult = await sandbox.execute(
      `mkdir -p ${defaults.workDirectory} && cd ${defaults.workDirectory} && unzip -o package.zip && rm package.zip`
    );

    if (extractResult.exitCode !== 0) {
      throw new Error(`Failed to extract package: ${extractResult.stderr}`);
    }

    addLog.info('[Sandbox] Package extracted successfully');

    // Step 7: Get endpoint information
    addLog.info('[Sandbox] Getting endpoint', { port: defaults.targetPort });
    const endpoint = await sandbox.getEndpoint(defaults.targetPort);

    const endpointInfo: SkillSandboxEndpointType = {
      host: endpoint.host,
      port: endpoint.port,
      protocol: endpoint.protocol,
      url: endpoint.url
    };

    addLog.info('[Sandbox] Endpoint obtained', endpointInfo);

    // Step 8: Save to MongoDB
    newSandboxDoc = await mongoSessionRun(async (session) => {
      const doc = await MongoSkillSandbox.create(
        [
          {
            skillId,
            sandboxType: SandboxTypeEnum.editDebug,
            teamId,
            tmbId,
            sandbox: {
              provider: 'opensandbox',
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

    // Cleanup: delete provider sandbox if created
    if (sandbox) {
      try {
        await sandbox.delete();
      } catch (cleanupError) {
        addLog.error('[Sandbox] Failed to cleanup sandbox after error', { cleanupError });
      }
    }

    throw error;
  } finally {
    // Close connection
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
      provider: 'opensandbox',
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
      provider: 'opensandbox',
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

    return Buffer.from(files[0].content);
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
      provider: 'opensandbox',
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
