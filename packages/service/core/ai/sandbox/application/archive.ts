/**
 * 沙盒业务层：编排 sandbox 归档、恢复和归档状态迁移。
 *
 * 负责统一处理远端压缩、对象存储、Mongo 状态和 provider 资源生命周期。
 */
import { getErrText } from '@fastgpt/global/common/error/utils';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { subDays, subMinutes } from 'date-fns';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ISandbox, SandboxCreateSpec } from '@fastgpt-sdk/sandbox-adapter';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getS3SandboxSource } from '../../../../common/s3/sources/sandbox';
import { serviceEnv } from '../../../../env';
import { getSandboxAdapterConfig } from '../infrastructure/provider/config';
import { connectToSandbox, disconnectSandbox } from '../infrastructure/provider/lifecycle';
import { getSandboxRuntimeProfile } from '../infrastructure/provider/runtimeProfile';
import { joinSandboxPath } from '../utils';
import {
  deleteSessionVolume,
  getSessionVolumeConfig,
  type VolumeManagerResult
} from '../infrastructure/volume/service';
import {
  clearSandboxArchiveState,
  clearFailedSandboxArchiveState,
  clearStaleArchivingSandboxStates,
  createSandboxResourcesToArchiveCursor,
  findSandboxInstanceArchiveState,
  markSandboxArchived,
  markSandboxArchiving,
  markSandboxArchivingForRuntimeUpgrade,
  markSandboxArchiveFailed,
  markSandboxDeletingError,
  markStaleDeletingSandboxStatesArchived,
  markSandboxRestored,
  markSandboxRestoring,
  markSandboxResourceStopped,
  rollbackSandboxRestoring,
  tryMarkSandboxDeleting,
  type SandboxResourceDoc
} from '../infrastructure/instance/repository';
import { buildSandboxResourceAdapter } from '../infrastructure/provider/adapter';
import type { SandboxInstanceSchemaType, SandboxProviderType } from '../type';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

export const SANDBOX_ARCHIVE_INACTIVE_DAYS = 7;
const SANDBOX_ARCHIVE_BATCH_SIZE = 5;
const SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const SANDBOX_ARCHIVE_FLOW_TIMEOUT_MS = 10 * 60 * 1000;
export const SANDBOX_STALE_ARCHIVING_MINUTES = 15;
const SANDBOX_RESTORE_WAIT_TIMEOUT_MS = 180 * 1000;
const SANDBOX_RESTORE_WAIT_INTERVAL_MS = 1000;

const TEMP_ARCHIVE_FILE = '.fastgpt-sandbox-archive.zip';
const RESTORE_ARCHIVE_FILE = '.fastgpt-sandbox-restore.zip';
const EMPTY_ZIP_BUFFER = Buffer.from('504b0506000000000000000000000000000000000000', 'hex');
const ARCHIVE_TEMP_FILE_NAMES = [TEMP_ARCHIVE_FILE, RESTORE_ARCHIVE_FILE];

const getArchiveStartedAtTime = (resource: SandboxResourceDoc) =>
  resource.metadata?.archive?.startedAt
    ? new Date(resource.metadata.archive.startedAt).getTime()
    : undefined;

const hasMatchedArchiveWrite = (result: unknown) =>
  typeof result === 'object' &&
  result !== null &&
  'matchedCount' in result &&
  typeof (result as { matchedCount?: unknown }).matchedCount === 'number' &&
  (result as { matchedCount: number }).matchedCount > 0;

export class SandboxArchiveStateError extends Error {
  constructor(
    readonly state: string,
    message = `Sandbox is ${state}`
  ) {
    super(message);
    this.name = 'SandboxArchiveStateError';
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type SandboxArchiveFailure = {
  sandboxId: string;
  error: string;
};

export type SandboxArchiveResult = {
  total: number;
  successCount: number;
  skippedCount: number;
  failCount: number;
  failures: SandboxArchiveFailure[];
};

export type SandboxArchiveProgress = {
  processedCount: number;
  successCount: number;
  skippedCount: number;
  failCount: number;
  batchSize: number;
  failures: SandboxArchiveFailure[];
};

export type SandboxArchiveOptions = {
  onProgress?: (progress: SandboxArchiveProgress) => void | Promise<void>;
};

type SandboxArchiveSingleResult =
  | { status: 'success' }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string };

type FailedArchivePolicy = 'throw' | 'clearAndContinue';

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
 * 归档前确保 sandbox 内存在 zip 命令。
 *
 * 历史 sandbox 镜像可能缺少 zip，定时归档和升级归档都需要在打包前兜底安装。
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

/**
 * 恢复归档前确保 sandbox 内存在 unzip 命令。
 *
 * 新 runtime 镜像通常会内置 unzip，但恢复链路不能把这个作为隐式假设。
 */
const ensureUnzipAvailableInSandbox = async (params: { sandbox: ISandbox }) => {
  const { sandbox } = params;
  const command = [
    'if command -v unzip >/dev/null 2>&1; then exit 0; fi',
    'if command -v apt-get >/dev/null 2>&1; then',
    '  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends unzip || (apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends unzip);',
    'elif command -v apk >/dev/null 2>&1; then',
    '  apk add --no-cache unzip;',
    'elif command -v yum >/dev/null 2>&1; then',
    '  yum install -y unzip;',
    'elif command -v dnf >/dev/null 2>&1; then',
    '  dnf install -y unzip;',
    'else',
    '  echo "No supported package manager found to install unzip" >&2;',
    '  exit 127;',
    'fi',
    'command -v unzip >/dev/null 2>&1 || { echo "unzip command is still unavailable after install" >&2; exit 127; }'
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
  if (!latest) return;
  if (latest?.lastActiveAt && latest.lastActiveAt.getTime() !== resource.lastActiveAt.getTime()) {
    return;
  }
  const resourceStartedAt = getArchiveStartedAtTime(resource);
  const latestStartedAt = latest ? getArchiveStartedAtTime(latest) : undefined;
  if (resourceStartedAt && latestStartedAt && latestStartedAt !== resourceStartedAt) {
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

type SandboxArchiveFlowParams = {
  archivingDoc: SandboxResourceDoc;
  logLabel: string;
  inactiveBefore?: Date;
  markArchiveFailed: (error: string) => Promise<unknown>;
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`Sandbox archive flow timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

/**
 * 执行归档的公共流水线。
 *
 * 不同入口只负责抢占记录、回滚策略和是否需要删除远端前的二次检查；
 * zip workspace、上传 S3、删除远端资源、标记 archived 以及失败清理由这里统一维护。
 */
async function runSandboxArchiveFlow({
  archivingDoc,
  logLabel,
  inactiveBefore,
  markArchiveFailed
}: SandboxArchiveFlowParams): Promise<SandboxArchiveSingleResult> {
  let connectedSandbox: ISandbox | undefined;
  let deletingStarted = false;

  const markFailedBeforeDeleting = async (error: string) => {
    const failedResult = await markArchiveFailed(error);
    if (hasMatchedArchiveWrite(failedResult)) {
      await stopTemporaryLiftedSandbox(archivingDoc).catch((stopError) => {
        logger.error(`Failed to stop temporary lifted sandbox after ${logLabel} archive failure`, {
          sandboxId: archivingDoc.sandboxId,
          error: stopError
        });
      });
      return { status: 'failed' as const, error };
    }

    const latest = await findSandboxInstanceArchiveState({
      provider: archivingDoc.provider,
      sandboxId: archivingDoc.sandboxId
    });
    if (
      latest?.metadata?.archive?.state === 'deleting' &&
      getArchiveStartedAtTime(latest) === getArchiveStartedAtTime(archivingDoc)
    ) {
      await markSandboxDeletingError(archivingDoc, error).catch((markError) => {
        logger.error(`Failed to mark ${logLabel} deleting error after archive failure`, {
          sandboxId: archivingDoc.sandboxId,
          provider: archivingDoc.provider,
          error: markError
        });
      });
    }
    logger.warn(
      `Skip stopping temporary lifted sandbox because ${logLabel} archive state changed`,
      {
        sandboxId: archivingDoc.sandboxId,
        provider: archivingDoc.provider
      }
    );
    return { status: 'failed' as const, error };
  };

  const runFlow = async (): Promise<SandboxArchiveSingleResult> => {
    try {
      const { sandbox, profile } = await connectSandboxForArchive(archivingDoc);
      connectedSandbox = sandbox;

      await ensureZipAvailableInSandbox({
        sandbox
      });

      const archiveBuffer = await createWorkspaceArchive({
        sandbox,
        workDirectory: profile.workDirectory,
        sandboxId: archivingDoc.sandboxId
      });

      await getS3SandboxSource().uploadWorkspaceArchive({
        sandboxId: archivingDoc.sandboxId,
        body: archiveBuffer
      });

      const deletingResult = await tryMarkSandboxDeleting(archivingDoc, { inactiveBefore });
      if (deletingResult.matchedCount === 0) {
        await clearSandboxArchiveState(archivingDoc).catch((error) => {
          logger.error(`Failed to clear skipped ${logLabel} archive state`, {
            sandboxId: archivingDoc.sandboxId,
            provider: archivingDoc.provider,
            error
          });
        });
        await stopTemporaryLiftedSandbox(archivingDoc).catch((error) => {
          logger.error(`Failed to stop temporary lifted sandbox after ${logLabel} archive skip`, {
            sandboxId: archivingDoc.sandboxId,
            provider: archivingDoc.provider,
            error
          });
        });
        return { status: 'skipped', reason: 'Resource was modified or occupied' };
      }
      deletingStarted = true;

      try {
        await deleteArchivedRemoteResource(archivingDoc);
      } catch (error: unknown) {
        logger.error(`Failed to cleanup archived ${logLabel} remote resource`, {
          sandboxId: archivingDoc.sandboxId,
          provider: archivingDoc.provider,
          error
        });
        const errorMessage = getErrText(error);
        await markSandboxDeletingError(
          archivingDoc,
          `Failed to delete remote resource: ${errorMessage}`
        );
        return { status: 'failed', error: `Failed to delete remote resource: ${errorMessage}` };
      }

      const archivedResult = await markSandboxArchived(archivingDoc);
      if (archivedResult.matchedCount === 0) {
        logger.error(`${logLabel} archive state changed after remote resource deletion`, {
          sandboxId: archivingDoc.sandboxId,
          provider: archivingDoc.provider
        });
        await markSandboxDeletingError(
          archivingDoc,
          'Sandbox record changed after remote deletion'
        );
        return {
          status: 'failed',
          error: 'Sandbox record changed after remote resource deletion'
        };
      }
      return { status: 'success' };
    } finally {
      if (connectedSandbox) {
        await disconnectSandbox(connectedSandbox).catch(() => undefined);
      }
    }
  };

  try {
    return await withTimeout(runFlow(), SANDBOX_ARCHIVE_FLOW_TIMEOUT_MS);
  } catch (error: unknown) {
    const errorMessage = getErrText(error);
    if (deletingStarted) {
      await markSandboxDeletingError(archivingDoc, errorMessage).catch((markError) => {
        logger.error(`Failed to mark ${logLabel} deleting error after archive failure`, {
          sandboxId: archivingDoc.sandboxId,
          provider: archivingDoc.provider,
          error: markError
        });
      });
      logger.error(`Failed to archive ${logLabel} after deleting started`, {
        sandboxId: archivingDoc.sandboxId,
        provider: archivingDoc.provider,
        error
      });
      return { status: 'failed', error: errorMessage };
    }

    logger.error(`Failed to archive ${logLabel}`, {
      sandboxId: archivingDoc.sandboxId,
      provider: archivingDoc.provider,
      error
    });
    return markFailedBeforeDeleting(errorMessage);
  }
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
): Promise<SandboxArchiveSingleResult> {
  const archivingDoc = await markSandboxArchiving(resource, inactiveBefore);
  if (!archivingDoc) {
    return { status: 'skipped', reason: 'Resource was modified or occupied' };
  }

  return runSandboxArchiveFlow({
    archivingDoc,
    logLabel: 'sandbox',
    inactiveBefore,
    markArchiveFailed: (error) => markSandboxArchiveFailed(archivingDoc, error)
  });
}

/**
 * 用户点击升级 edit-debug runtime 时启动后台归档。
 *
 * 该入口同步完成 archive state CAS，把记录推进到 archiving 后立即返回；
 * 实际 workspace 打包、上传、远端删除在后台执行。进入 deleting 前失败会落到 failed，
 * 进入 deleting 后只记录 error 并保持 deleting，避免运行态绕过 S3 恢复。
 */
export async function startSandboxRuntimeUpgradeArchive(
  resource: SandboxResourceDoc
): Promise<
  { success: true; archivingDoc: SandboxResourceDoc } | { success: false; error: string }
> {
  const archivingDoc = await markSandboxArchivingForRuntimeUpgrade(resource);
  if (!archivingDoc) {
    return { success: false, error: 'Resource was modified or occupied' };
  }

  void runSandboxArchiveFlow({
    archivingDoc,
    logLabel: 'upgraded sandbox',
    markArchiveFailed: (error) => markSandboxArchiveFailed(archivingDoc, error)
  }).catch(async (error) => {
    const errorMessage = getErrText(error);
    logger.error('Unexpected runtime upgrade archive task failure', {
      sandboxId: resource.sandboxId,
      provider: resource.provider,
      error
    });
    await markSandboxArchiveFailed(archivingDoc, errorMessage).catch((markError) => {
      logger.error('Failed to mark runtime upgrade archive failed after unexpected failure', {
        sandboxId: resource.sandboxId,
        provider: resource.provider,
        originalError: errorMessage,
        error: markError
      });
    });
  });

  return { success: true, archivingDoc };
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
  let skippedCount = 0;
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
      if (result.status === 'success') {
        successCount++;
      } else if (result.status === 'skipped') {
        skippedCount++;
      } else {
        const failure = {
          sandboxId: resource.sandboxId,
          error: result.error
        };
        failures.push(failure);
        batchFailures.push(failure);
      }
    }

    await Promise.resolve(
      options?.onProgress?.({
        processedCount: successCount + skippedCount + failures.length,
        successCount,
        skippedCount,
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
    total: successCount + skippedCount + failures.length,
    successCount,
    skippedCount,
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
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId?: string;
  chatId?: string;
  vmConfig?: VolumeManagerResult | null;
  storage?: SandboxInstanceSchemaType['storage'];
  resourceLimit?: Partial<NonNullable<SandboxInstanceSchemaType['limit']>>;
  createConfig?: SandboxCreateSpec;
  failedArchivePolicy?: FailedArchivePolicy;
}) {
  const waitForArchiveBusyDone = async () => {
    const startAt = Date.now();
    let lastBusyState = 'restoring';
    while (Date.now() - startAt < SANDBOX_RESTORE_WAIT_TIMEOUT_MS) {
      await delay(SANDBOX_RESTORE_WAIT_INTERVAL_MS);
      const latest = await findSandboxInstanceArchiveState({
        provider: params.provider,
        sandboxId: params.sandboxId
      });
      const latestArchiveState = latest?.metadata?.archive?.state;

      if (!latestArchiveState) return;
      if (latestArchiveState === 'archived') {
        return latest;
      }
      if (latestArchiveState !== 'archiving' && latestArchiveState !== 'restoring') {
        return latest;
      }
      lastBusyState = latestArchiveState;
    }

    throw new SandboxArchiveStateError(lastBusyState);
  };

  let currentProviderInstance = await findSandboxInstanceArchiveState({
    provider: params.provider,
    sandboxId: params.sandboxId
  });
  let archiveState = currentProviderInstance?.metadata?.archive?.state;

  if (!archiveState) {
    return;
  }

  if (archiveState === 'archiving' || archiveState === 'restoring') {
    const archivedAfterWait = await waitForArchiveBusyDone();
    if (!archivedAfterWait) return;
    currentProviderInstance = archivedAfterWait;
    archiveState = currentProviderInstance.metadata?.archive?.state;
  }

  if (
    archiveState === 'failed' &&
    params.failedArchivePolicy === 'clearAndContinue' &&
    currentProviderInstance
  ) {
    await clearFailedSandboxArchiveState(currentProviderInstance);
    return;
  }

  if (archiveState === 'failed') {
    throw new SandboxArchiveStateError('failed');
  }

  if ((archiveState !== 'archived' && archiveState !== 'deleting') || !currentProviderInstance) {
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
      const latestArchiveState = latest?.metadata?.archive?.state;
      if (!latestArchiveState) {
        return;
      }
      if (latestArchiveState === 'archiving' || latestArchiveState === 'restoring') {
        await waitForArchiveBusyDone();
        return;
      }
      throw new SandboxArchiveStateError(latestArchiveState);
    }

    const restoreTarget = await createRestoreSandbox({
      provider: params.provider,
      sandboxId: params.sandboxId,
      vmConfig: params.vmConfig,
      createConfig: params.createConfig
    });
    sandbox = restoreTarget.sandbox;
    await ensureUnzipAvailableInSandbox({ sandbox });

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
      sourceType: params.sourceType,
      sourceId: params.sourceId,
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
 * archive state 都由归档流程或显式用户请求处理，后台保活只负责阻塞。
 */
export async function assertSandboxNotArchivedOrBusy(params: {
  provider: SandboxProviderType;
  sandboxId: string;
}) {
  const instance = await findSandboxInstanceArchiveState(params);
  const archiveState = instance?.metadata?.archive?.state;

  if (
    archiveState === 'archiving' ||
    archiveState === 'deleting' ||
    archiveState === 'archived' ||
    archiveState === 'restoring' ||
    archiveState === 'failed'
  ) {
    throw new SandboxArchiveStateError(archiveState);
  }
}

/**
 * 清理超过归档整体 timeout/grace 后仍卡住的归档状态。
 *
 * archiving 尚未确认 S3 包，超时后清理标记；deleting 已有 S3 包，超时后收敛为 archived，
 * 后续启动统一走 restore。
 */
export async function clearStaleArchivingSandboxes(now = new Date()) {
  const staleBefore = subMinutes(now, SANDBOX_STALE_ARCHIVING_MINUTES);
  const [archivingResult, deletingResult] = await Promise.all([
    clearStaleArchivingSandboxStates(staleBefore),
    markStaleDeletingSandboxStatesArchived(staleBefore)
  ]);

  return {
    archivingResult,
    deletingResult
  };
}
