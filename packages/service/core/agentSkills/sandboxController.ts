/**
 * Skill Sandbox Controller
 *
 * Provides core business logic for managing skill sandbox instances.
 *
 */

import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { MongoSandboxInstance } from '../ai/sandbox/schema';
import {
  getSandboxProviderConfig,
  getSandboxDefaults,
  getSkillSizeLimits,
  connectToProviderSandbox,
  disconnectFromProviderSandbox
} from './sandboxConfig';
import type { SandboxInstanceSchemaType } from '@fastgpt/global/core/agentSkills/type';
import { getSandboxClient } from '../ai/sandbox/controller';
import { getLogger, LogCategories } from '../../common/logger';

const addLog = getLogger(LogCategories.MODULE.AI.AGENT);

export type GetSandboxInfoParams = {
  sandboxId: string;
  teamId: string;
};

export type DeleteSandboxParams = {
  sandboxId: string;
  teamId: string;
};

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

  const client = await getSandboxClient({ sandboxId: instanceDoc.sandboxId });
  await client.delete().catch((err) => {
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
    instances.map(async (doc) => {
      const client = await getSandboxClient({ sandboxId: doc.sandboxId });
      await client.delete().catch((err) => {
        addLog.error('[Sandbox] Failed to delete sandbox', {
          sandboxId: doc.sandboxId,
          error: err
        });
      });
    })
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

    // Clean up the zip file after reading to free sandbox storage
    await newSandbox.execute(`rm -f "${zipFilePath}"`);

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
