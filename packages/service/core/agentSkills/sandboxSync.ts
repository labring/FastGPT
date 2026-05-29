/**
 * Skill Sandbox Sync
 *
 * Push the latest MinIO package.zip to the Run Preview sandbox
 * and unzip in-place. Only clears first-level entries from the current zip,
 * leaving other skills' directories in the same workspace untouched.
 *
 * Targeted sandbox instance:
 *   chatId = `debug-${hashStr(`${skillId}-${AGENT_NODE_ID}`).slice(0, 40)}`
 *
 * AGENT_NODE_ID must stay in sync with debugChat.ts:66.
 *
 * Uses acquireSkillEditLock (shared with packageEditor) to avoid reading a stale
 * storage key that was just overwritten by a concurrent edit across replicas.
 */
import JSZip from 'jszip';
import { UserError } from '@fastgpt/global/common/error/utils';
import { MongoSandboxInstance } from '../ai/sandbox/schema';
import { getSandboxClient } from '../ai/sandbox/controller';
import { downloadSkillPackage } from './storage';
import { getSandboxDefaults } from './sandboxConfig';
import { listZipDirectory } from './packageEditor';
import { acquireSkillEditLock, releaseSkillEditLock } from './editLock';
import { MongoAgentSkills } from './schema';
import { getLogger, LogCategories } from '../../common/logger';
import { hashStr } from '@fastgpt/global/common/string/tools';

const addLog = getLogger(LogCategories.MODULE.AI.AGENT);

// Keep in sync with debugChat.ts:66.
const AGENT_NODE_ID = 'skill-debug-agent';

export type SyncSkillSandboxResult = {
  synced: boolean;
  reason: 'noSandbox' | 'pushed';
};

/** Single-quote for shell argument with basic escaping. */
function shellSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Sync current skill's MinIO package to the Run Preview sandbox.
 *
 * - no sandbox instance → { synced: false, reason: 'noSandbox' } (lifecycle creates with latest zip)
 * - instance exists → download zip → write to container → remove only zip's root entries → unzip
 */
export async function syncSkillSandbox(params: {
  skillId: string;
  teamId: string;
}): Promise<SyncSkillSandboxResult> {
  const { skillId, teamId } = params;

  const sessionId = `debug-${hashStr(`${skillId}-${AGENT_NODE_ID}`).slice(0, 40)}`;
  const instance = await MongoSandboxInstance.findOne({
    chatId: sessionId
  }).lean();

  if (!instance) {
    return { synced: false, reason: 'noSandbox' };
  }

  const lockHandle = await acquireSkillEditLock(skillId);
  try {
    // Re-read inside lock to get latest currentStorage
    const skill = await MongoAgentSkills.findOne({
      _id: skillId,
      teamId,
      deleteTime: null
    });

    if (!skill || !skill.currentStorage || !skill.currentStorage.key) {
      throw new UserError('Skill has no active version');
    }

    const zipBuffer = await downloadSkillPackage({ storageInfo: skill.currentStorage });

    const zip = await JSZip.loadAsync(zipBuffer);

    // Validate zip entries before unzipping (Zip Slip defence)
    const dangerous = Object.keys(zip.files).some((k) => k.includes('..') || k.startsWith('/'));
    if (dangerous) {
      throw new UserError('Package contains invalid paths');
    }

    // Parse top-level entries to selectively clean
    const rootEntries = listZipDirectory(zip, '');
    const rootNames = rootEntries.map((e) => e.name).filter((n) => n && n !== '.' && n !== '..');

    const client = await getSandboxClient({ sandboxId: instance.sandboxId });
    const { workDirectory } = getSandboxDefaults();
    const zipPath = `${workDirectory}/__sync.zip`;

    await client.provider.writeFiles([{ path: zipPath, data: zipBuffer }]);

    const removeOldCmd =
      rootNames.length > 0 ? `rm -rf ${rootNames.map(shellSingleQuote).join(' ')}` : 'true';

    const command = [
      'set -e',
      `cd ${workDirectory}`,
      removeOldCmd,
      'unzip -oq __sync.zip',
      'rm -f __sync.zip'
    ].join(' && ');

    const result = await client.provider.execute(command);
    if (result.exitCode !== 0) {
      throw new Error(
        `Failed to sync skill package to sandbox: exitCode=${result.exitCode}, stderr=${result.stderr}`
      );
    }

    addLog.info('[Sandbox] Synced sandbox', {
      skillId,
      sandboxId: instance.sandboxId,
      sessionId,
      rootEntries: rootNames,
      size: zipBuffer.length
    });

    return { synced: true, reason: 'pushed' };
  } finally {
    await releaseSkillEditLock(lockHandle);
  }
}
