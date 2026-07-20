/**
 * Sandbox Workspace 归档与恢复。
 *
 * 远端副作用由 Durable Saga activity 执行，Mongo Saga snapshot 是唯一恢复事实源。
 */
import { getErrText } from '@fastgpt/global/common/error/utils';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { subDays } from 'date-fns';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ISandbox, SandboxCreateSpec } from '@fastgpt-sdk/sandbox-adapter';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getS3SandboxSource } from '../../../../common/s3/sources/sandbox';
import { getAgentSandboxArchiveMaxBytes } from '../interface/config';
import {
  createSandboxResourcesToArchiveCursor,
  findSandboxInstanceBySandboxId,
  type SandboxResourceDoc
} from '../infrastructure/instance/repository';
import { getSandboxAdapterConfig } from '../infrastructure/provider/config';
import {
  buildRuntimeSandboxAdapter,
  buildSandboxResourceAdapter
} from '../infrastructure/provider/adapter';
import {
  connectToSandbox,
  disconnectSandbox,
  ensureConnectedSandboxRunning
} from '../infrastructure/provider/lifecycle';
import { getSandboxRuntimeProfile } from '../infrastructure/provider/runtimeProfile';
import {
  deleteSessionVolume,
  getSessionVolumeConfig,
  type VolumeManagerResult
} from '../infrastructure/volume/service';
import {
  SandboxInstanceStatusEnum,
  type SandboxInstanceSchemaType,
  type SandboxProviderType
} from '../type';
import { joinSandboxPath } from '../utils';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

export const SANDBOX_ARCHIVE_INACTIVE_DAYS = 7;
const SANDBOX_ARCHIVE_BATCH_SIZE = 5;
const SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

const TEMP_ARCHIVE_FILE = '.fastgpt-sandbox-archive.zip';
const RESTORE_ARCHIVE_FILE = '.fastgpt-sandbox-restore.zip';
const DURABLE_RESTORE_MARKER_FILE = '.fastgpt-durable-restore';
const EMPTY_ZIP_BUFFER = Buffer.from('504b0506000000000000000000000000000000000000', 'hex');
const ARCHIVE_TEMP_FILE_NAMES = [TEMP_ARCHIVE_FILE, RESTORE_ARCHIVE_FILE];

type SandboxArchiveResource = Pick<
  SandboxResourceDoc,
  'provider' | 'sandboxId' | 'status' | 'lastActiveAt'
> & {
  metadata?: unknown;
};

const getLegacyArchiveState = (resource: SandboxArchiveResource) =>
  (resource.metadata as { archive?: { state?: string } } | undefined)?.archive?.state;

export class SandboxLifecycleStateError extends Error {
  constructor(
    readonly state: string,
    message = `Sandbox is ${state}`
  ) {
    super(message);
    this.name = 'SandboxLifecycleStateError';
  }
}

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

/** 归档前确保历史镜像中存在 zip。 */
const ensureZipAvailableInSandbox = async (sandbox: ISandbox) => {
  const command = [
    'if command -v zip >/dev/null 2>&1; then exit 0; fi',
    'if command -v apt-get >/dev/null 2>&1; then',
    '  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends zip || (apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends zip);',
    'elif command -v apk >/dev/null 2>&1; then apk add --no-cache zip;',
    'elif command -v yum >/dev/null 2>&1; then yum install -y zip;',
    'elif command -v dnf >/dev/null 2>&1; then dnf install -y zip;',
    'else echo "No supported package manager found to install zip" >&2; exit 127; fi',
    'command -v zip >/dev/null 2>&1'
  ].join('\n');
  await runSandboxCommand(sandbox, command, {
    timeoutMs: SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS,
    maxOutputBytes: 8 * 1024
  });
};

/** 恢复前确保镜像中存在 unzip。 */
const ensureUnzipAvailableInSandbox = async (sandbox: ISandbox) => {
  const command = [
    'if command -v unzip >/dev/null 2>&1; then exit 0; fi',
    'if command -v apt-get >/dev/null 2>&1; then',
    '  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends unzip || (apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends unzip);',
    'elif command -v apk >/dev/null 2>&1; then apk add --no-cache unzip;',
    'elif command -v yum >/dev/null 2>&1; then yum install -y unzip;',
    'elif command -v dnf >/dev/null 2>&1; then dnf install -y unzip;',
    'else echo "No supported package manager found to install unzip" >&2; exit 127; fi',
    'command -v unzip >/dev/null 2>&1'
  ].join('\n');
  await runSandboxCommand(sandbox, command, {
    timeoutMs: SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS,
    maxOutputBytes: 8 * 1024
  });
};

async function buildArchiveRuntimeConfig(resource: SandboxArchiveResource) {
  const profile = getSandboxRuntimeProfile(resource.provider);
  const vmConfig =
    resource.provider === 'opensandbox'
      ? await getSessionVolumeConfig(resource.sandboxId)
      : undefined;
  return { profile, vmConfig };
}

/** 归档临时连接不经过运行态 client，避免刷新 lastActiveAt。 */
async function connectSandboxForArchive(resource: SandboxArchiveResource) {
  const { profile, vmConfig } = await buildArchiveRuntimeConfig(resource);
  const upstreamId =
    typeof (resource.metadata as { upstreamId?: unknown } | undefined)?.upstreamId === 'string'
      ? (resource.metadata as { upstreamId: string }).upstreamId
      : undefined;
  const sandbox = buildRuntimeSandboxAdapter(resource.provider, resource.sandboxId, {
    upstreamId,
    vmConfig,
    createConfig: { metadata: { archive: 'true' } }
  });
  await ensureConnectedSandboxRunning(sandbox);
  return { sandbox, profile };
}

export async function deleteArchivedRemoteResource(resource: SandboxResourceDoc) {
  await buildSandboxResourceAdapter(resource).delete();
  if (resource.provider === 'opensandbox') {
    await deleteSessionVolume(resource.sandboxId);
  }
}

/** Creates the Workspace zip and uploads it with the durable step idempotency marker. */
export async function uploadSandboxWorkspaceArchive(params: {
  resource: SandboxResourceDoc;
  idempotencyKey: string;
}) {
  let sandbox: ISandbox | undefined;
  try {
    const connected = await connectSandboxForArchive(params.resource);
    sandbox = connected.sandbox;
    await ensureZipAvailableInSandbox(sandbox);
    const body = await createWorkspaceArchive({
      sandbox,
      workDirectory: connected.profile.workDirectory,
      sandboxId: params.resource.sandboxId
    });
    await getS3SandboxSource().uploadWorkspaceArchive({
      sandboxId: params.resource.sandboxId,
      body,
      idempotencyKey: params.idempotencyKey
    });
  } finally {
    if (sandbox) await disconnectSandbox(sandbox).catch(() => undefined);
  }
}

async function createWorkspaceArchive(params: {
  sandbox: ISandbox;
  workDirectory: string;
  sandboxId: string;
}) {
  const { sandbox, workDirectory, sandboxId } = params;
  const maxArchiveBytes = getAgentSandboxArchiveMaxBytes();
  const archivePath = joinSandboxPath(workDirectory, TEMP_ARCHIVE_FILE);
  const quotedWorkDirectory = shellQuote(workDirectory);
  const quotedArchiveFile = shellQuote(TEMP_ARCHIVE_FILE);
  const findExcludes = ARCHIVE_TEMP_FILE_NAMES.map(
    (fileName) => `! -name ${shellQuote(fileName)}`
  ).join(' ');
  const zipExcludes = ARCHIVE_TEMP_FILE_NAMES.flatMap((fileName) => [
    `-x ${shellQuote(fileName)}`,
    `-x ${shellQuote(`*/${fileName}`)}`
  ]).join(' ');

  await runSandboxCommand(sandbox, `mkdir -p ${quotedWorkDirectory}`, { timeoutMs: 60 * 1000 });
  await sandbox.deleteFiles([archivePath]).catch(() => undefined);
  const [sizeResult, entryCountResult] = await Promise.all([
    runSandboxCommand(
      sandbox,
      `cd ${quotedWorkDirectory} && find . -type f ${findExcludes} -ls 2>/dev/null | awk '{s+=$7} END {print s+0}'`,
      { timeoutMs: SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS, maxOutputBytes: 8 * 1024 }
    ),
    runSandboxCommand(
      sandbox,
      `cd ${quotedWorkDirectory} && find . -mindepth 1 ${findExcludes} 2>/dev/null | wc -l`,
      { timeoutMs: SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS, maxOutputBytes: 8 * 1024 }
    )
  ]);
  const workspaceBytes = Number.parseInt(sizeResult.stdout.trim(), 10);
  const entryCount = Number.parseInt(entryCountResult.stdout.trim(), 10);
  if (Number.isFinite(entryCount) && entryCount === 0) return EMPTY_ZIP_BUFFER;
  if (Number.isFinite(workspaceBytes) && workspaceBytes > maxArchiveBytes) {
    throw new Error('Sandbox workspace is too large');
  }

  await runSandboxCommand(
    sandbox,
    `cd ${quotedWorkDirectory} && zip -r -y -q ${quotedArchiveFile} . ${zipExcludes}`,
    { timeoutMs: SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS, maxOutputBytes: 8 * 1024 }
  );
  const [archive] = await sandbox.readFiles([archivePath]);
  if (archive.error) throw new Error(`Failed to read sandbox archive: ${archive.error.message}`);
  const archiveBuffer = Buffer.from(archive.content);
  if (archiveBuffer.byteLength > maxArchiveBytes) throw new Error('Sandbox archive is too large');
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
  await runSandboxCommand(sandbox, `mkdir -p ${quotedWorkDirectory}`, { timeoutMs: 60 * 1000 });
  const [writeResult] = await sandbox.writeFiles([{ path: archivePath, data: archiveBody }]);
  if (writeResult.error) {
    throw new Error(`Failed to write sandbox archive: ${writeResult.error.message}`);
  }
  const command = archiveBody.equals(EMPTY_ZIP_BUFFER)
    ? `cd ${quotedWorkDirectory} && find . -mindepth 1 -maxdepth 1 ! -name ${quotedArchiveFile} -exec rm -rf -- {} + && rm -f ${quotedArchiveFile}`
    : [
        `cd ${quotedWorkDirectory}`,
        `unzip -Z -t ${quotedArchiveFile} | awk -v max=${getAgentSandboxArchiveMaxBytes()} 'BEGIN { ok=0 } /uncompressed,/ { ok=(($3 + 0) <= max) } END { exit ok ? 0 : 1 }'`,
        `unzip -Z1 ${quotedArchiveFile} | awk 'BEGIN { ok=1 } /^\\// || /(^|\\/)\\.\\.($|\\/)/ { ok=0 } END { exit ok ? 0 : 1 }'`,
        `find . -mindepth 1 -maxdepth 1 ! -name ${quotedArchiveFile} -exec rm -rf -- {} +`,
        `unzip -o -q ${quotedArchiveFile} -d .`,
        `rm -f ${quotedArchiveFile}`
      ].join(' && ');
  await runSandboxCommand(sandbox, command, {
    timeoutMs: SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS,
    maxOutputBytes: 8 * 1024
  }).catch(async (error) => {
    await sandbox.deleteFiles([archivePath]).catch(() => undefined);
    throw error;
  });
  logger.info('Sandbox workspace restored from archive', { sandboxId });
}

/** 获取正式旧集合 Sandbox 的 Workspace 归档，供用户级 migration 使用。 */
export async function getSandboxWorkspaceArchiveForMigration(resource: SandboxArchiveResource) {
  const archiveSource = getS3SandboxSource();
  const archiveState = getLegacyArchiveState(resource);
  // restoring 已经以 S3 归档为恢复源；migration 应复用该归档，不能再打包半恢复的 Workspace。
  if (archiveState === 'archived' || archiveState === 'deleting' || archiveState === 'restoring') {
    if (await archiveSource.isWorkspaceArchiveExists({ sandboxId: resource.sandboxId })) {
      return archiveSource.downloadWorkspaceArchive({
        sandboxId: resource.sandboxId,
        maxBytes: getAgentSandboxArchiveMaxBytes()
      });
    }
    throw new Error(`Archived Legacy Sandbox workspace is missing: ${resource.sandboxId}`);
  }

  let sandbox: ISandbox | undefined;
  try {
    const connected = await connectSandboxForArchive(resource);
    sandbox = connected.sandbox;
    await ensureZipAvailableInSandbox(sandbox);
    const body = await createWorkspaceArchive({
      sandbox,
      workDirectory: connected.profile.workDirectory,
      sandboxId: resource.sandboxId
    });
    await archiveSource.uploadWorkspaceArchive({ sandboxId: resource.sandboxId, body });
    return body;
  } finally {
    if (sandbox) await disconnectSandbox(sandbox).catch(() => undefined);
  }
}

/** 将已校验的 Workspace 归档恢复到 migration staging 目录。 */
export async function restoreSandboxWorkspaceArchiveForMigration(params: {
  sandbox: ISandbox;
  workDirectory: string;
  sandboxId: string;
  archiveBody: Buffer;
}) {
  await ensureUnzipAvailableInSandbox(params.sandbox);
  await restoreWorkspaceArchive(params);
}

/** 归档单个 inactive sandbox。 */
export async function archiveSandboxResource(
  resource: SandboxResourceDoc,
  inactiveBefore: Date
): Promise<SandboxArchiveSingleResult> {
  if (
    resource.status !== SandboxInstanceStatusEnum.running &&
    resource.status !== SandboxInstanceStatusEnum.stopped
  ) {
    return { status: 'skipped', reason: `Sandbox is ${resource.status}` };
  }
  if (resource.lastActiveAt >= inactiveBefore) {
    return { status: 'skipped', reason: 'Resource became active' };
  }
  const { archiveSandboxResourceWithSaga } = await import('./lifecycle/service');
  await archiveSandboxResourceWithSaga(resource);
  return { status: 'success' };
}

/** 用户触发 runtime 升级后创建归档 Saga，由 worker 或恢复轮询继续执行。 */
export async function startSandboxRuntimeUpgradeArchive(
  resource: SandboxResourceDoc
): Promise<
  { success: true; archivingDoc: SandboxResourceDoc } | { success: false; error: string }
> {
  const { archiveSandboxResourceWithSaga } = await import('./lifecycle/service');
  await archiveSandboxResourceWithSaga(resource, { run: false });
  const archivingDoc = await findSandboxInstanceBySandboxId({ sandboxId: resource.sandboxId });
  return archivingDoc?.status === SandboxInstanceStatusEnum.archiving
    ? { success: true, archivingDoc }
    : { success: false, error: 'Resource was modified or occupied' };
}

/** 流式归档全部候选，并按固定并发报告进度。 */
export async function archiveSandboxResources(params: {
  inactiveBefore: Date;
  providers?: SandboxProviderType[];
  options?: SandboxArchiveOptions;
}): Promise<SandboxArchiveResult> {
  const cursor = createSandboxResourcesToArchiveCursor(params);
  let successCount = 0;
  let skippedCount = 0;
  const failures: SandboxArchiveFailure[] = [];
  let batch: SandboxResourceDoc[] = [];

  const archiveBatch = async (resources: SandboxResourceDoc[]) => {
    const results = await batchRun(
      resources,
      async (resource) => ({
        resource,
        result: await archiveSandboxResource(resource, params.inactiveBefore).catch((error) => ({
          status: 'failed' as const,
          error: getErrText(error)
        }))
      }),
      SANDBOX_ARCHIVE_BATCH_SIZE
    );
    const batchFailures: SandboxArchiveFailure[] = [];
    for (const { resource, result } of results) {
      if (result.status === 'success') successCount++;
      else if (result.status === 'skipped') skippedCount++;
      else {
        const failure = { sandboxId: resource.sandboxId, error: result.error };
        failures.push(failure);
        batchFailures.push(failure);
      }
    }
    await Promise.resolve(
      params.options?.onProgress?.({
        processedCount: successCount + skippedCount + failures.length,
        successCount,
        skippedCount,
        failCount: failures.length,
        batchSize: resources.length,
        failures: batchFailures
      })
    ).catch((error) => logger.error('Failed to report sandbox archive progress', { error }));
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

export async function archiveInactiveSandboxes(now = new Date()) {
  return archiveSandboxResources({
    inactiveBefore: subDays(now, SANDBOX_ARCHIVE_INACTIVE_DAYS)
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
  return {
    sandbox: await connectToSandbox(providerConfig, params.sandboxId, createConfig),
    profile,
    storage: vmConfig?.storage
  };
}

/** Installs the S3 archive and writes a stable marker used by reconcile after a lost response. */
export async function installSandboxWorkspaceArchive(params: {
  provider: SandboxProviderType;
  sandboxId: string;
  idempotencyKey: string;
  vmConfig?: VolumeManagerResult | null;
  createConfig?: SandboxCreateSpec;
}) {
  let sandbox: ISandbox | undefined;
  try {
    const target = await createRestoreSandbox({
      ...params,
      createConfig: {
        ...params.createConfig,
        metadata: {
          ...params.createConfig?.metadata,
          durableSagaIdempotencyKey: params.idempotencyKey
        }
      }
    });
    sandbox = target.sandbox;
    await ensureUnzipAvailableInSandbox(sandbox);
    const body = await getS3SandboxSource().downloadWorkspaceArchive({
      sandboxId: params.sandboxId,
      maxBytes: getAgentSandboxArchiveMaxBytes()
    });
    await restoreWorkspaceArchive({
      sandbox,
      workDirectory: target.profile.workDirectory,
      sandboxId: params.sandboxId,
      archiveBody: body
    });
    const markerPath = joinSandboxPath(target.profile.workDirectory, DURABLE_RESTORE_MARKER_FILE);
    const [marker] = await sandbox.writeFiles([
      { path: markerPath, data: Buffer.from(params.idempotencyKey) }
    ]);
    if (marker.error) {
      throw new Error(`Failed to write durable restore marker: ${marker.error.message}`);
    }
    const upstreamId = sandbox.id;
    if (!upstreamId) throw new Error('Restored Sandbox Provider returned no upstream ID');
    return { storage: target.storage, upstreamId };
  } catch (error) {
    if (sandbox) await sandbox.stop().catch(() => undefined);
    throw error;
  } finally {
    if (sandbox) await disconnectSandbox(sandbox).catch(() => undefined);
  }
}

/** Reads an existing Workspace marker without calling ensureRunning, so reconcile cannot create. */
export async function inspectSandboxWorkspaceRestore(params: {
  provider: SandboxProviderType;
  sandboxId: string;
  idempotencyKey: string;
  vmConfig?: VolumeManagerResult | null;
  createConfig?: SandboxCreateSpec;
}) {
  const profile = getSandboxRuntimeProfile(params.provider);
  const sandbox = buildRuntimeSandboxAdapter(params.provider, params.sandboxId, {
    vmConfig: params.vmConfig ?? undefined,
    createConfig: {
      ...params.createConfig,
      metadata: {
        ...params.createConfig?.metadata,
        durableSagaIdempotencyKey: params.idempotencyKey
      }
    }
  });
  try {
    const info = await sandbox.getInfo();
    if (!info) return { applied: false as const };
    const [marker] = await sandbox.readFiles([
      joinSandboxPath(profile.workDirectory, DURABLE_RESTORE_MARKER_FILE)
    ]);
    if (marker.error) return { applied: false as const };
    const markerValue = Buffer.from(marker.content).toString('utf8');
    return {
      applied: markerValue === params.idempotencyKey,
      upstreamId: info.id
    } as const;
  } finally {
    await disconnectSandbox(sandbox).catch(() => undefined);
  }
}

/** 在真实用户使用前恢复 archived Workspace。 */
export async function restoreArchivedSandboxBeforeUse(params: {
  provider: SandboxProviderType;
  sandboxId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  vmConfig?: VolumeManagerResult | null;
  storage?: SandboxInstanceSchemaType['storage'];
  resourceLimit?: Partial<NonNullable<SandboxInstanceSchemaType['limit']>>;
  createConfig?: SandboxCreateSpec;
}) {
  const initial = await findSandboxInstanceBySandboxId({ sandboxId: params.sandboxId });
  if (
    !initial ||
    initial.status === SandboxInstanceStatusEnum.running ||
    initial.status === SandboxInstanceStatusEnum.stopped
  ) {
    return;
  }
  if (
    initial.status !== SandboxInstanceStatusEnum.archived &&
    initial.status !== SandboxInstanceStatusEnum.restoring
  ) {
    throw new SandboxLifecycleStateError(initial.status);
  }

  if (
    params.sourceType !== ChatSourceTypeEnum.app &&
    params.sourceType !== ChatSourceTypeEnum.skillEdit
  ) {
    throw new Error(`Unsupported durable Sandbox source type: ${params.sourceType}`);
  }
  const { restoreSandboxWithSaga } = await import('./lifecycle/service');
  const completed = await restoreSandboxWithSaga({
    resource: initial,
    provider: params.provider,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    userId: params.userId,
    storage: params.storage ?? undefined,
    limit: params.resourceLimit,
    vmConfig: params.vmConfig,
    createConfig: params.createConfig
  });
  if (!completed) throw new SandboxLifecycleStateError(SandboxInstanceStatusEnum.restoring);
}

/** keepalive 等后台路径只检查状态，不能触发恢复或首次创建。 */
export async function assertSandboxRuntimeUsableWithoutRestore(params: {
  provider: SandboxProviderType;
  sandboxId: string;
}) {
  const instance = await findSandboxInstanceBySandboxId({ sandboxId: params.sandboxId });
  if (
    instance &&
    instance.status !== SandboxInstanceStatusEnum.running &&
    instance.status !== SandboxInstanceStatusEnum.stopped
  ) {
    throw new SandboxLifecycleStateError(instance.status);
  }
}
