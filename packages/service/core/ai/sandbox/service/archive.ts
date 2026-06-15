import { getErrText } from '@fastgpt/global/common/error/utils';
import { batchRun } from '@fastgpt/global/common/system/utils';
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
  createSandboxResourcesToArchiveCursor,
  findSandboxInstanceArchiveState,
  isSandboxStillArchiving,
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
const SANDBOX_ARCHIVE_BATCH_SIZE = 5;
const SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

const TEMP_ARCHIVE_FILE = '.fastgpt-sandbox-archive.zip';
const RESTORE_ARCHIVE_FILE = '.fastgpt-sandbox-restore.zip';
const EMPTY_ZIP_BUFFER = Buffer.from('504b0506000000000000000000000000000000000000', 'hex');
const ARCHIVE_TEMP_FILE_NAMES = [TEMP_ARCHIVE_FILE, RESTORE_ARCHIVE_FILE];

export class SandboxArchiveStateError extends Error {
  constructor(
    readonly state: string,
    message = `Sandbox is ${state}`
  ) {
    super(message);
    this.name = 'SandboxArchiveStateError';
  }
}

export interface SandboxArchiveFailure {
  sandboxId: string;
  error: string;
}

export interface SandboxArchiveResult {
  total: number;
  successCount: number;
  failCount: number;
  failures: SandboxArchiveFailure[];
}

export interface SandboxArchiveProgress {
  processedCount: number;
  successCount: number;
  failCount: number;
  batchSize: number;
  failures: SandboxArchiveFailure[];
}

export interface SandboxArchiveOptions {
  ensureZipInSandbox?: boolean;
  onProgress?: (progress: SandboxArchiveProgress) => void | Promise<void>;
}

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

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

/**
 * init 归档脚本兼容历史 sandbox 镜像缺少 zip 的场景。
 * 仅在脚本显式传入开关时执行，避免改变常规 cron 归档行为。
 */
const ensureZipAvailableInSandbox = async (params: { sandbox: ISandbox }) => {
  const { sandbox } = params;
  const command = [
    'if command -v zip >/dev/null 2>&1; then exit 0; fi',
    'if command -v apt-get >/dev/null 2>&1; then',
    '  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends zip || (apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends zip);',
    'elif command -v apk >/dev/null 2>&1; then',
    '  apk add --no-cache zip;',
    'elif command -v yum >/dev/null 2>&1; then',
    '  yum install -y zip;',
    'elif command -v dnf >/dev/null 2>&1; then',
    '  dnf install -y zip;',
    'else',
    '  echo "No supported package manager found to install zip" >&2;',
    '  exit 127;',
    'fi',
    'command -v zip >/dev/null 2>&1 || { echo "zip command is still unavailable after install" >&2; exit 127; }'
  ].join('\n');

  await runSandboxCommand(sandbox, command, {
    timeoutMs: SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS,
    maxOutputBytes: 8 * 1024
  });
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
        archive: 'true'
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

async function createWorkspaceArchive(params: {
  sandbox: ISandbox;
  workDirectory: string;
  sandboxId: string;
}) {
  const { sandbox, workDirectory, sandboxId } = params;
  const maxArchiveBytes = serviceEnv.AGENT_SANDBOX_ARCHIVE_MAX_SIZE * 1024 * 1024;
  const archivePath = joinSandboxPath(workDirectory, TEMP_ARCHIVE_FILE);
  const quotedWorkDirectory = shellQuote(workDirectory);
  const quotedArchiveFile = shellQuote(TEMP_ARCHIVE_FILE);
  // find -name 匹配 basename；zip -x 需要同时排除根目录和子目录路径。
  const archiveTempFileFindExcludes = ARCHIVE_TEMP_FILE_NAMES.map(
    (fileName) => `! -name ${shellQuote(fileName)}`
  ).join(' ');
  const archiveTempFileZipExcludes = ARCHIVE_TEMP_FILE_NAMES.flatMap((fileName) => [
    `-x ${shellQuote(fileName)}`,
    `-x ${shellQuote(`*/${fileName}`)}`
  ]).join(' ');
  const sizeCheckCmd =
    `cd ${quotedWorkDirectory} && ` +
    `find . -type f ${archiveTempFileFindExcludes} ` +
    `-ls 2>/dev/null | awk '{s+=$7} END {print s+0}'`;
  const entryCountCmd =
    `cd ${quotedWorkDirectory} && ` +
    `find . -mindepth 1 ${archiveTempFileFindExcludes} ` +
    `2>/dev/null | wc -l`;

  await runSandboxCommand(sandbox, `mkdir -p ${shellQuote(workDirectory)}`, {
    timeoutMs: 60 * 1000
  });
  await sandbox.deleteFiles([archivePath]).catch(() => undefined);

  const [sizeResult, entryCountResult] = await Promise.all([
    runSandboxCommand(sandbox, sizeCheckCmd, {
      timeoutMs: SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS,
      maxOutputBytes: 8 * 1024
    }),
    runSandboxCommand(sandbox, entryCountCmd, {
      timeoutMs: SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS,
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
    `cd ${quotedWorkDirectory} && zip -r -y -q ${quotedArchiveFile} . ${archiveTempFileZipExcludes}`,
    {
      timeoutMs: SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS,
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
  const maxArchiveBytes = serviceEnv.AGENT_SANDBOX_ARCHIVE_MAX_SIZE * 1024 * 1024;
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
        `unzip -Z -t ${quotedArchiveFile} | awk -v max=${maxArchiveBytes} 'BEGIN { ok=0 } /uncompressed,/ { ok=(($3 + 0) <= max) } END { exit ok ? 0 : 1 }'`,
        `unzip -Z1 ${quotedArchiveFile} | awk 'BEGIN { ok=1 } /^\\// || /(^|\\/)\\.\\.($|\\/)/ { ok=0 } END { exit ok ? 0 : 1 }'`,
        `find . -mindepth 1 -maxdepth 1 ! -name ${quotedArchiveFile} -exec rm -rf -- {} +`,
        `unzip -o -q ${quotedArchiveFile} -d .`,
        `rm -f ${quotedArchiveFile}`
      ].join(' && ');

  await runSandboxCommand(sandbox, restoreCommand, {
    timeoutMs: SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS,
    maxOutputBytes: 8 * 1024
  }).catch(async (error) => {
    await sandbox.deleteFiles([archivePath]).catch(() => undefined);
    throw error;
  });

  logger.info('Sandbox workspace restored from archive', { sandboxId });
}

/**
 * 归档单个 sandbox 实例。
 *
 * inactiveBefore 是归档判断边界，调用方负责用同一个边界查询候选资源并执行归档，
 * 避免同一轮任务中查询时间和二次活跃检查时间不一致。
 */
export async function archiveSandboxResource(
  resource: SandboxResourceDoc,
  inactiveBefore: Date,
  options: SandboxArchiveOptions = {}
): Promise<{ success: boolean; error?: string }> {
  const archivingDoc = await markSandboxArchiving(resource, inactiveBefore);
  if (!archivingDoc) {
    return { success: false, error: 'Resource was modified or occupied' };
  }

  let connectedSandbox: ISandbox | undefined;
  let remoteResourceDeleted = false;
  try {
    const { sandbox, profile } = await connectSandboxForArchive(archivingDoc);
    connectedSandbox = sandbox;

    if (options.ensureZipInSandbox) {
      await ensureZipAvailableInSandbox({
        sandbox
      });
    }

    const archiveBuffer = await createWorkspaceArchive({
      sandbox,
      workDirectory: profile.workDirectory,
      sandboxId: archivingDoc.sandboxId
    });

    await getS3SandboxSource().uploadWorkspaceArchive({
      sandboxId: archivingDoc.sandboxId,
      body: archiveBuffer
    });

    const stillArchiving = await isSandboxStillArchiving(archivingDoc, inactiveBefore);
    if (!stillArchiving) {
      await clearSandboxArchiveState(archivingDoc);
      await getS3SandboxSource()
        .deleteWorkspaceArchive({
          sandboxId: archivingDoc.sandboxId
        })
        .catch((error) => {
          logger.error('Failed to delete aborted sandbox archive', {
            sandboxId: archivingDoc.sandboxId,
            error
          });
        });
      await stopTemporaryLiftedSandbox(archivingDoc).catch((error) => {
        logger.error('Failed to stop temporary lifted sandbox after archive abort', {
          sandboxId: archivingDoc.sandboxId,
          error
        });
      });
      return { success: false, error: 'Archive aborted because of subsequent user activity' };
    }

    try {
      await deleteArchivedRemoteResource(archivingDoc);
      remoteResourceDeleted = true;
    } catch (error: unknown) {
      logger.error('Failed to cleanup archived sandbox remote resource', {
        sandboxId: archivingDoc.sandboxId,
        provider: archivingDoc.provider,
        error
      });
      const errorMessage = getErrText(error);
      await getS3SandboxSource()
        .deleteWorkspaceArchive({
          sandboxId: archivingDoc.sandboxId
        })
        .catch((deleteError) => {
          logger.error('Failed to delete sandbox archive after remote cleanup failure', {
            sandboxId: archivingDoc.sandboxId,
            provider: archivingDoc.provider,
            error: deleteError
          });
        });
      await clearSandboxArchiveState(archivingDoc).catch((clearError) => {
        logger.error('Failed to clear archive state after remote cleanup failure', {
          sandboxId: archivingDoc.sandboxId,
          provider: archivingDoc.provider,
          error: clearError
        });
      });
      await stopTemporaryLiftedSandbox(archivingDoc).catch((stopError) => {
        logger.error('Failed to stop temporary lifted sandbox after remote cleanup failure', {
          sandboxId: archivingDoc.sandboxId,
          error: stopError
        });
      });
      return {
        success: false,
        error: `Failed to delete remote resource: ${errorMessage}`
      };
    }

    const archivedResult = await markSandboxArchived(archivingDoc);
    if (archivedResult.matchedCount === 0) {
      logger.error('Sandbox archive state changed after remote resource deletion', {
        sandboxId: archivingDoc.sandboxId,
        provider: archivingDoc.provider
      });
      return {
        success: false,
        error: 'Sandbox record changed after remote resource deletion'
      };
    }
    return { success: true };
  } catch (error: unknown) {
    const errorMessage = getErrText(error);
    if (remoteResourceDeleted) {
      await markSandboxArchived(archivingDoc).catch((markError) => {
        logger.error('Failed to mark sandbox archived after remote resource deletion', {
          sandboxId: archivingDoc.sandboxId,
          provider: archivingDoc.provider,
          error: markError
        });
      });
      logger.error('Failed to archive sandbox after remote resource deletion', {
        sandboxId: archivingDoc.sandboxId,
        provider: archivingDoc.provider,
        error
      });
      return { success: false, error: errorMessage };
    }

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
    return { success: false, error: errorMessage };
  } finally {
    if (connectedSandbox) {
      await disconnectSandbox(connectedSandbox).catch(() => undefined);
    }
  }
}

/**
 * 流式读取待归档 sandbox，并按固定批次执行实际归档。
 *
 * cursor 的 batchSize 控制 Mongo 单次返回量；归档 batch 控制远端资源同时拉起数量。
 * 这里不设置总量上限，迁移脚本需要覆盖所有历史待归档记录。
 */
export async function archiveSandboxResources(params: {
  inactiveBefore: Date;
  providers?: SandboxProviderType[];
  options?: SandboxArchiveOptions;
}): Promise<SandboxArchiveResult> {
  const { inactiveBefore, providers, options } = params;
  const cursor = createSandboxResourcesToArchiveCursor({
    inactiveBefore,
    providers
  });

  let successCount = 0;
  const failures: SandboxArchiveFailure[] = [];
  let batch: SandboxResourceDoc[] = [];

  const archiveBatch = async (resources: SandboxResourceDoc[]) => {
    if (resources.length === 0) return;

    const results = await batchRun(
      resources,
      async (resource) => ({
        resource,
        result: await archiveSandboxResource(resource, inactiveBefore, options)
      }),
      SANDBOX_ARCHIVE_BATCH_SIZE
    );

    const batchFailures: SandboxArchiveFailure[] = [];
    for (const { resource, result } of results) {
      if (result.success) {
        successCount++;
      } else {
        const failure = {
          sandboxId: resource.sandboxId,
          error: result.error || 'Unknown error'
        };
        failures.push(failure);
        batchFailures.push(failure);
      }
    }

    await Promise.resolve(
      options?.onProgress?.({
        processedCount: successCount + failures.length,
        successCount,
        failCount: failures.length,
        batchSize: resources.length,
        failures: batchFailures
      })
    ).catch((error) => {
      logger.error('Failed to report sandbox archive progress', { error });
    });
  };

  try {
    for await (const resource of cursor) {
      batch.push(resource);
      if (batch.length >= SANDBOX_ARCHIVE_BATCH_SIZE) {
        await archiveBatch(batch);
        batch = [];
      }
    }
    await archiveBatch(batch);
  } finally {
    await cursor.close().catch(() => undefined);
  }

  return {
    total: successCount + failures.length,
    successCount,
    failCount: failures.length,
    failures
  };
}

/**
 * 批量归档超过 7 天未活跃的 sandbox。
 */
export async function archiveInactiveSandboxes(now = new Date()) {
  const inactiveBefore = subDays(now, SANDBOX_ARCHIVE_INACTIVE_DAYS);
  await archiveSandboxResources({
    inactiveBefore
  });
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
  const archiveState = currentProviderInstance?.metadata?.archive?.state;

  if (!archiveState) {
    return;
  }

  if (archiveState === 'archiving' || archiveState === 'restoring') {
    throw new SandboxArchiveStateError(archiveState);
  }

  if (archiveState !== 'archived') {
    return;
  }

  let sandbox: ISandbox | undefined;
  let restoringDoc: SandboxResourceDoc | null = null;
  try {
    restoringDoc = await markSandboxRestoring(currentProviderInstance);
    if (!restoringDoc) {
      const latest = await findSandboxInstanceArchiveState({
        provider: params.provider,
        sandboxId: params.sandboxId
      });
      if (!latest?.metadata?.archive?.state) {
        return;
      }
      throw new SandboxArchiveStateError(latest.metadata.archive.state);
    }

    const restoreTarget = await createRestoreSandbox({
      provider: params.provider,
      sandboxId: params.sandboxId,
      vmConfig: params.vmConfig,
      createConfig: params.createConfig
    });
    sandbox = restoreTarget.sandbox;

    const archiveBody = await getS3SandboxSource().downloadWorkspaceArchive({
      sandboxId: params.sandboxId,
      maxBytes: serviceEnv.AGENT_SANDBOX_ARCHIVE_MAX_SIZE * 1024 * 1024
    });
    await restoreWorkspaceArchive({
      sandbox,
      workDirectory: restoreTarget.profile.workDirectory,
      sandboxId: params.sandboxId,
      archiveBody
    });
    const restoredStorage = params.storage ?? restoreTarget.storage;

    const restoredDoc = await markSandboxRestored(restoringDoc, {
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
      const latest = await findSandboxInstanceArchiveState({
        provider: params.provider,
        sandboxId: params.sandboxId
      });
      if (!latest) {
        throw new Error('Sandbox archive record was deleted during restore');
      }
      if (!latest.metadata?.archive?.state) {
        if (sandbox) {
          await sandbox.stop().catch((stopError) => {
            logger.error('Failed to stop duplicate restored sandbox after restore race', {
              sandboxId: params.sandboxId,
              error: stopError
            });
          });
        }
        return;
      }
      throw new SandboxArchiveStateError(latest.metadata.archive.state);
    }
  } catch (error) {
    if (sandbox) {
      await sandbox.stop().catch((stopError) => {
        logger.error('Failed to stop sandbox after archive restore failure', {
          sandboxId: params.sandboxId,
          error: stopError
        });
      });
    }
    if (restoringDoc) {
      await rollbackSandboxRestoring(restoringDoc).catch((rollbackError) => {
        logger.error('Failed to rollback sandbox restoring state', {
          sandboxId: params.sandboxId,
          error: rollbackError
        });
      });
    }
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
 * archiving、archived、restoring 都由归档流程处理，后台保活只负责阻塞。
 */
export async function assertSandboxNotArchivedOrBusy(params: {
  provider: SandboxProviderType;
  sandboxId: string;
}) {
  const instance = await findSandboxInstanceArchiveState(params);
  const archiveState = instance?.metadata?.archive?.state;

  if (archiveState === 'archiving' || archiveState === 'archived' || archiveState === 'restoring') {
    throw new SandboxArchiveStateError(archiveState);
  }
}
