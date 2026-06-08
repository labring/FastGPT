import { subDays } from 'date-fns';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import type { ISandbox, SandboxCreateSpec } from '@fastgpt-sdk/sandbox-adapter';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getS3SandboxSource } from '../../../../common/s3/sources/sandbox';
import { serviceEnv } from '../../../../env';
import { getSandboxAdapterConfig } from '../provider/config';
import { connectToSandbox, disconnectSandbox } from '../provider/lifecycle';
import { getSandboxRuntimeProfile } from '../runtime/profile';
import { joinSandboxPath } from '../runtime/profile/utils';
import {
  deleteSessionVolume,
  getSessionVolumeConfig,
  type VolumeManagerResult
} from '../volume/service';
import {
  clearSandboxArchiveState,
  findSandboxArchiveStateBySandboxId,
  findSandboxInstanceArchiveState,
  findSandboxResourcesToArchive,
  markSandboxArchived,
  markSandboxArchiving,
  markSandboxRestored,
  markSandboxRestoring,
  markSandboxResourceStopped,
  rollbackSandboxRestoring,
  type SandboxResourceDoc
} from '../instance/repository';
import { buildSandboxResourceAdapter } from '../provider/adapter';
import type { SandboxInstanceSchemaType, SandboxProviderType } from '../type';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

export const SANDBOX_ARCHIVE_INACTIVE_DAYS = 7;
export const SANDBOX_ARCHIVE_CRON_LIMIT = 20;

const TEMP_ARCHIVE_FILE = '.fastgpt-sandbox-archive.zip';
const RESTORE_ARCHIVE_FILE = '.fastgpt-sandbox-restore.zip';
const EMPTY_ZIP_BUFFER = Buffer.from('504b0506000000000000000000000000000000000000', 'hex');
const ARCHIVE_EXCLUDE_PATTERNS = [TEMP_ARCHIVE_FILE, RESTORE_ARCHIVE_FILE];
const MB_TO_BYTES = 1024 * 1024;

export class SandboxArchiveStateError extends Error {
  constructor(
    readonly state: string,
    message = `Sandbox is ${state}`
  ) {
    super(message);
    this.name = 'SandboxArchiveStateError';
  }
}

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;
const getSandboxArchiveMaxBytes = () => serviceEnv.AGENT_SANDBOX_ARCHIVE_MAX_SIZE * MB_TO_BYTES;

const runSandboxCommand = async (
  sandbox: ISandbox,
  command: string,
  options: { timeoutMs?: number; maxOutputBytes?: number } = {}
) => {
  const result = await sandbox.execute(command, {
    timeoutMs: options.timeoutMs,
    maxOutputBytes: options.maxOutputBytes
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || `Sandbox command failed: ${command}`);
  }

  return result;
};

async function buildArchiveRuntimeConfig(resource: SandboxResourceDoc) {
  const profile = getSandboxRuntimeProfile(resource.provider);
  const vmConfig =
    resource.provider === 'opensandbox'
      ? await getSessionVolumeConfig(resource.sandboxId)
      : undefined;
  const { providerConfig, createConfig } = getSandboxAdapterConfig({
    provider: resource.provider,
    runtime: true,
    sessionId: resource.sandboxId,
    vmConfig,
    createConfig: {
      metadata: {
        archive: true
      }
    }
  });

  return {
    profile,
    providerConfig,
    createConfig
  };
}

/**
 * 连接归档流程需要的 sandbox。
 *
 * 注意：这里禁止使用 getSandboxClient/SandboxClient.ensureAvailable，因为运行态 client 会刷新
 * lastActiveAt。归档临时拉起只允许走 provider lifecycle。
 */
async function connectSandboxForArchive(resource: SandboxResourceDoc) {
  const { profile, providerConfig, createConfig } = await buildArchiveRuntimeConfig(resource);
  const sandbox = await connectToSandbox(providerConfig, resource.sandboxId, createConfig);

  return {
    sandbox,
    profile
  };
}

async function stopTemporaryLiftedSandbox(resource: SandboxResourceDoc) {
  if (resource.status !== SandboxStatusEnum.stopped) return;

  const latest = await findSandboxInstanceArchiveState({
    provider: resource.provider,
    sandboxId: resource.sandboxId
  });
  if (latest?.lastActiveAt && latest.lastActiveAt.getTime() !== resource.lastActiveAt.getTime()) {
    return;
  }

  const sandbox = buildSandboxResourceAdapter(resource);
  await sandbox.stop();
  await markSandboxResourceStopped(resource);
}

async function deleteArchivedRemoteResource(resource: SandboxResourceDoc) {
  const sandbox = buildSandboxResourceAdapter(resource);
  await sandbox.delete();

  if (resource.provider === 'opensandbox') {
    await deleteSessionVolume(resource.sandboxId).catch((error) => {
      logger.error('Failed to delete archived sandbox volume', {
        sandboxId: resource.sandboxId,
        error
      });
    });
  }
}

async function isStillArchivingAndInactive(resource: SandboxResourceDoc, inactiveBefore: Date) {
  const latest = await findSandboxInstanceArchiveState({
    provider: resource.provider,
    sandboxId: resource.sandboxId
  });

  return (
    latest?.metadata?.archive?.state === 'archiving' &&
    latest.lastActiveAt.getTime() < inactiveBefore.getTime()
  );
}

async function createWorkspaceArchive(params: {
  sandbox: ISandbox;
  workDirectory: string;
  sandboxId: string;
}) {
  const { sandbox, workDirectory, sandboxId } = params;
  const maxArchiveBytes = getSandboxArchiveMaxBytes();
  const archivePath = joinSandboxPath(workDirectory, TEMP_ARCHIVE_FILE);
  const quotedWorkDirectory = shellQuote(workDirectory);
  const quotedArchiveFile = shellQuote(TEMP_ARCHIVE_FILE);
  const excludeArgs = ARCHIVE_EXCLUDE_PATTERNS.map((pattern) => `-x ${shellQuote(pattern)}`).join(
    ' '
  );
  const sizeCheckCmd =
    `cd ${quotedWorkDirectory} && ` +
    `find . -type f ${ARCHIVE_EXCLUDE_PATTERNS.map((pattern) => `! -name ${shellQuote(pattern)}`).join(' ')} ` +
    `-ls 2>/dev/null | awk '{s+=$7} END {print s+0}'`;
  const entryCountCmd =
    `cd ${quotedWorkDirectory} && ` +
    `find . -mindepth 1 ${ARCHIVE_EXCLUDE_PATTERNS.map((pattern) => `! -name ${shellQuote(pattern)}`).join(' ')} ` +
    `2>/dev/null | wc -l`;

  await runSandboxCommand(sandbox, `mkdir -p ${shellQuote(workDirectory)}`, {
    timeoutMs: 60 * 1000
  });
  await sandbox.deleteFiles([archivePath]).catch(() => undefined);

  const [sizeResult, entryCountResult] = await Promise.all([
    runSandboxCommand(sandbox, sizeCheckCmd, {
      timeoutMs: 15 * 60 * 1000,
      maxOutputBytes: 8 * 1024
    }),
    runSandboxCommand(sandbox, entryCountCmd, {
      timeoutMs: 15 * 60 * 1000,
      maxOutputBytes: 8 * 1024
    })
  ]);
  const workspaceBytes = Number.parseInt(sizeResult.stdout.trim(), 10);
  const entryCount = Number.parseInt(entryCountResult.stdout.trim(), 10);
  if (Number.isFinite(entryCount) && entryCount === 0) {
    return EMPTY_ZIP_BUFFER;
  }
  if (Number.isFinite(workspaceBytes) && workspaceBytes > maxArchiveBytes) {
    throw new Error('Sandbox workspace is too large');
  }

  await runSandboxCommand(
    sandbox,
    `cd ${quotedWorkDirectory} && zip -r -q ${quotedArchiveFile} . ${excludeArgs}`,
    {
      timeoutMs: 15 * 60 * 1000,
      maxOutputBytes: 8 * 1024
    }
  );

  const [archive] = await sandbox.readFiles([archivePath]);
  if (archive.error) {
    throw new Error(`Failed to read sandbox archive: ${archive.error.message}`);
  }
  const archiveBuffer = Buffer.from(archive.content);
  if (archiveBuffer.byteLength > maxArchiveBytes) {
    throw new Error('Sandbox archive is too large');
  }

  await sandbox.deleteFiles([archivePath]).catch((error) => {
    logger.warn('Failed to cleanup sandbox archive temp file', { sandboxId, error });
  });

  return archiveBuffer;
}

async function restoreWorkspaceArchive(params: {
  sandbox: ISandbox;
  workDirectory: string;
  sandboxId: string;
  archiveBody: Buffer;
}) {
  const { sandbox, workDirectory, sandboxId, archiveBody } = params;
  const archivePath = joinSandboxPath(workDirectory, RESTORE_ARCHIVE_FILE);
  const quotedWorkDirectory = shellQuote(workDirectory);
  const quotedArchiveFile = shellQuote(RESTORE_ARCHIVE_FILE);

  await runSandboxCommand(sandbox, `mkdir -p ${shellQuote(workDirectory)}`, {
    timeoutMs: 60 * 1000
  });

  const [writeResult] = await sandbox.writeFiles([
    {
      path: archivePath,
      data: archiveBody
    }
  ]);
  if (writeResult.error) {
    throw new Error(`Failed to write sandbox archive: ${writeResult.error.message}`);
  }

  const isEmptyArchive = archiveBody.equals(EMPTY_ZIP_BUFFER);
  const restoreCommand = isEmptyArchive
    ? `cd ${quotedWorkDirectory} && find . -mindepth 1 -maxdepth 1 ! -name ${quotedArchiveFile} -exec rm -rf -- {} + && rm -f ${quotedArchiveFile}`
    : [
        `cd ${quotedWorkDirectory}`,
        `unzip -tq ${quotedArchiveFile} >/dev/null`,
        `unzip -Z1 ${quotedArchiveFile} | awk 'BEGIN { ok=1 } /^\\// || /(^|\\/)\\.\\.($|\\/)/ { ok=0 } END { exit ok ? 0 : 1 }'`,
        `find . -mindepth 1 -maxdepth 1 ! -name ${quotedArchiveFile} -exec rm -rf -- {} +`,
        `unzip -o -q ${quotedArchiveFile} -d .`,
        `rm -f ${quotedArchiveFile}`
      ].join(' && ');

  await runSandboxCommand(sandbox, restoreCommand, {
    timeoutMs: 15 * 60 * 1000,
    maxOutputBytes: 8 * 1024
  }).catch(async (error) => {
    await sandbox.deleteFiles([archivePath]).catch(() => undefined);
    throw error;
  });

  logger.info('Sandbox workspace restored from archive', { sandboxId });
}

/**
 * 归档单个 sandbox 实例。
 */
export async function archiveSandboxResource(resource: SandboxResourceDoc, now = new Date()) {
  const inactiveBefore = subDays(now, SANDBOX_ARCHIVE_INACTIVE_DAYS);
  const archivingDoc = await markSandboxArchiving(resource, inactiveBefore);
  if (!archivingDoc) return;

  let connectedSandbox: ISandbox | undefined;
  try {
    const { sandbox, profile } = await connectSandboxForArchive(archivingDoc);
    connectedSandbox = sandbox;

    const archiveBuffer = await createWorkspaceArchive({
      sandbox,
      workDirectory: profile.workDirectory,
      sandboxId: archivingDoc.sandboxId
    });

    await getS3SandboxSource().uploadWorkspaceArchive({
      sandboxId: archivingDoc.sandboxId,
      body: archiveBuffer
    });

    if (!(await isStillArchivingAndInactive(archivingDoc, inactiveBefore))) {
      await clearSandboxArchiveState(archivingDoc);
      await stopTemporaryLiftedSandbox(archivingDoc).catch((error) => {
        logger.error('Failed to stop temporary lifted sandbox after archive abort', {
          sandboxId: archivingDoc.sandboxId,
          error
        });
      });
      return;
    }

    try {
      await deleteArchivedRemoteResource(archivingDoc);
    } catch (error) {
      await clearSandboxArchiveState(archivingDoc);
      await stopTemporaryLiftedSandbox(archivingDoc).catch((stopError) => {
        logger.error('Failed to stop temporary lifted sandbox after archive delete failure', {
          sandboxId: archivingDoc.sandboxId,
          error: stopError
        });
      });
      logger.error('Failed to cleanup archived sandbox remote resource', {
        sandboxId: archivingDoc.sandboxId,
        provider: archivingDoc.provider,
        error
      });
      return;
    }

    const archivedResult = await markSandboxArchived(archivingDoc);
    if (archivedResult.matchedCount === 0) {
      logger.warn('Sandbox record missing after remote resource was deleted', {
        sandboxId: archivingDoc.sandboxId,
        provider: archivingDoc.provider
      });
    }
  } catch (error) {
    await clearSandboxArchiveState(archivingDoc);
    await stopTemporaryLiftedSandbox(archivingDoc).catch((stopError) => {
      logger.error('Failed to stop temporary lifted sandbox after archive failure', {
        sandboxId: archivingDoc.sandboxId,
        error: stopError
      });
    });
    logger.error('Failed to archive sandbox', {
      sandboxId: archivingDoc.sandboxId,
      provider: archivingDoc.provider,
      error
    });
  } finally {
    if (connectedSandbox) {
      await disconnectSandbox(connectedSandbox).catch(() => undefined);
    }
  }
}

/**
 * 批量归档超过 7 天未活跃的 sandbox。
 */
export async function archiveInactiveSandboxes(now = new Date()) {
  const resources = await findSandboxResourcesToArchive({
    inactiveBefore: subDays(now, SANDBOX_ARCHIVE_INACTIVE_DAYS),
    limit: SANDBOX_ARCHIVE_CRON_LIMIT
  });

  for (const resource of resources) {
    await archiveSandboxResource(resource, now);
  }
}

async function createRestoreSandbox(params: {
  provider: SandboxProviderType;
  sandboxId: string;
  vmConfig?: VolumeManagerResult | null;
  createConfig?: SandboxCreateSpec;
}) {
  const vmConfig =
    params.vmConfig !== undefined
      ? (params.vmConfig ?? undefined)
      : params.provider === 'opensandbox'
        ? await getSessionVolumeConfig(params.sandboxId)
        : undefined;
  const profile = getSandboxRuntimeProfile(params.provider);
  const { providerConfig, createConfig } = getSandboxAdapterConfig({
    provider: params.provider,
    runtime: true,
    sessionId: params.sandboxId,
    vmConfig,
    createConfig: params.createConfig
  });
  const sandbox = await connectToSandbox(providerConfig, params.sandboxId, createConfig);

  return {
    sandbox,
    profile,
    storage: vmConfig?.storage
  };
}

/**
 * 如果指定 sandbox 已冷归档，则在运行态 ensureAvailable 前恢复工作区。
 */
export async function restoreArchivedSandboxBeforeUse(params: {
  provider: SandboxProviderType;
  sandboxId: string;
  appId?: string;
  userId?: string;
  chatId?: string;
  vmConfig?: VolumeManagerResult | null;
  storage?: SandboxInstanceSchemaType['storage'];
  resourceLimit?: Partial<NonNullable<SandboxInstanceSchemaType['limit']>>;
  createConfig?: SandboxCreateSpec;
}) {
  const currentProviderInstance = await findSandboxInstanceArchiveState({
    provider: params.provider,
    sandboxId: params.sandboxId
  });
  const instance =
    currentProviderInstance ?? (await findSandboxArchiveStateBySandboxId(params.sandboxId));
  const archiveState = instance?.metadata?.archive?.state;

  if (!archiveState) {
    return;
  }

  if (archiveState === 'archiving') {
    if (currentProviderInstance) {
      await clearSandboxArchiveState({
        provider: instance.provider,
        sandboxId: params.sandboxId,
        _id: instance?._id
      });
      return;
    }
    throw new SandboxArchiveStateError(archiveState);
  }

  if (archiveState === 'restoring') {
    throw new SandboxArchiveStateError(archiveState);
  }

  if (archiveState !== 'archived') {
    return;
  }

  const restoringDoc = await markSandboxRestoring({
    provider: instance.provider,
    sandboxId: params.sandboxId,
    _id: instance?._id
  });
  if (!restoringDoc) {
    throw new SandboxArchiveStateError('restoring');
  }

  let sandbox: ISandbox | undefined;
  try {
    const restoreTarget = await createRestoreSandbox({
      provider: params.provider,
      sandboxId: params.sandboxId,
      vmConfig: params.vmConfig,
      createConfig: params.createConfig
    });
    sandbox = restoreTarget.sandbox;

    const archiveBody = await getS3SandboxSource().downloadWorkspaceArchive({
      sandboxId: params.sandboxId
    });
    await restoreWorkspaceArchive({
      sandbox,
      workDirectory: restoreTarget.profile.workDirectory,
      sandboxId: params.sandboxId,
      archiveBody
    });
    const restoredStorage = params.storage ?? restoreTarget.storage;

    const restoredDoc = await markSandboxRestored(restoringDoc, {
      provider: params.provider,
      appId: params.appId,
      userId: params.userId,
      chatId: params.chatId,
      storage: restoredStorage,
      limit: params.resourceLimit,
      metadata: {
        volumeEnabled: !!restoredStorage
      }
    });
    if (!restoredDoc) {
      throw new SandboxArchiveStateError('restoring');
    }
  } catch (error) {
    await rollbackSandboxRestoring(restoringDoc);
    throw error;
  } finally {
    if (sandbox) {
      await disconnectSandbox(sandbox).catch(() => undefined);
    }
  }
}

/**
 * 只检查冷归档状态，不触发恢复。
 *
 * keepalive 这类后台保活不能单独恢复已归档实例，否则会在没有真实用户动作时重建资源。
 * archiving 是可取消状态，运行态访问会刷新 lastActiveAt，归档任务删除前二次检查会放弃。
 */
export async function assertSandboxNotArchivedOrBusy(params: {
  provider: SandboxProviderType;
  sandboxId: string;
}) {
  const currentProviderInstance = await findSandboxInstanceArchiveState(params);
  const instance =
    currentProviderInstance ?? (await findSandboxArchiveStateBySandboxId(params.sandboxId));
  const archiveState = instance?.metadata?.archive?.state;

  if (archiveState === 'archiving') {
    if (currentProviderInstance) return;
    throw new SandboxArchiveStateError(archiveState);
  }

  if (archiveState === 'archived' || archiveState === 'restoring') {
    throw new SandboxArchiveStateError(archiveState);
  }
}
