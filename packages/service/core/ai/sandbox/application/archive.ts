/**
 * Sandbox Workspace 归档与恢复。
 *
 * 远端副作用始终在 Lifecycle Lease 内、Mongo operation 抢占之后执行。
 */
import { getErrText } from '@fastgpt/global/common/error/utils';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { subDays, subMinutes } from 'date-fns';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ISandbox, SandboxCreateSpec } from '@fastgpt-sdk/sandbox-adapter';
import type { RedisLeaseContext } from '../../../../common/redis/lock';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getS3SandboxSource } from '../../../../common/s3/sources/sandbox';
import { getAgentSandboxArchiveMaxBytes } from '../interface/config';
import {
  createSandboxResourcesToArchiveCursor,
  findSandboxInstanceBySandboxId,
  findStaleSandboxOperations,
  type SandboxResourceDoc
} from '../infrastructure/instance/repository';
import { getSandboxAdapterConfig } from '../infrastructure/provider/config';
import { buildSandboxResourceAdapter } from '../infrastructure/provider/adapter';
import { connectToSandbox, disconnectSandbox } from '../infrastructure/provider/lifecycle';
import { getSandboxRuntimeProfile } from '../infrastructure/provider/runtimeProfile';
import {
  deleteSessionVolume,
  getSessionVolumeConfig,
  type VolumeManagerResult
} from '../infrastructure/volume/service';
import {
  SandboxInstanceStatusEnum,
  SandboxOperationTypeEnum,
  type SandboxInstanceSchemaType,
  type SandboxProviderType
} from '../type';
import { joinSandboxPath } from '../utils';
import { withSandboxLifecycleLease } from './lease';
import { runSandboxLifecycleOperation, type SandboxLifecycleDefinition } from './lifecycle/runner';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

export const SANDBOX_ARCHIVE_INACTIVE_DAYS = 7;
const SANDBOX_ARCHIVE_BATCH_SIZE = 5;
const SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
// 单次归档可能包含安装工具、扫描、压缩和上传；隔离窗口必须覆盖整条确定性命令链。
export const SANDBOX_STALE_ARCHIVING_MINUTES = 45;

const TEMP_ARCHIVE_FILE = '.fastgpt-sandbox-archive.zip';
const RESTORE_ARCHIVE_FILE = '.fastgpt-sandbox-restore.zip';
const EMPTY_ZIP_BUFFER = Buffer.from('504b0506000000000000000000000000000000000000', 'hex');
const ARCHIVE_TEMP_FILE_NAMES = [TEMP_ARCHIVE_FILE, RESTORE_ARCHIVE_FILE];

type SandboxPhysicalResource = Pick<
  SandboxResourceDoc,
  'provider' | 'sandboxId' | 'status' | 'lastActiveAt'
> & {
  metadata?: unknown;
};

const getLegacyArchiveState = (resource: SandboxPhysicalResource) =>
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

async function buildArchiveRuntimeConfig(resource: SandboxPhysicalResource) {
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
    createConfig: { metadata: { archive: 'true' } }
  });
  return { profile, providerConfig, createConfig };
}

/** 归档临时连接不经过运行态 client，避免刷新 lastActiveAt。 */
async function connectSandboxForArchive(resource: SandboxPhysicalResource) {
  const { profile, providerConfig, createConfig } = await buildArchiveRuntimeConfig(resource);
  return {
    sandbox: await connectToSandbox(providerConfig, resource.sandboxId, createConfig),
    profile
  };
}

async function deleteArchivedRemoteResource(resource: SandboxResourceDoc) {
  await buildSandboxResourceAdapter(resource).delete();
  if (resource.provider === 'opensandbox') {
    await deleteSessionVolume(resource.sandboxId);
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

/** 获取 Legacy Sandbox 的 Workspace 归档，供本分支 migration 核心流程使用。 */
export async function getSandboxWorkspaceArchiveForMigration(resource: SandboxPhysicalResource) {
  const archiveSource = getS3SandboxSource();
  const archiveState = getLegacyArchiveState(resource);
  // restoring 已经以 S3 归档为恢复源；migration 应复用该归档，不能再打包半恢复的 Workspace。
  if (archiveState === 'archived' || archiveState === 'deleting' || archiveState === 'restoring') {
    if (await archiveSource.isLegacyWorkspaceArchiveExists({ sandboxId: resource.sandboxId })) {
      return archiveSource.downloadLegacyWorkspaceArchive({
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
    await archiveSource.uploadLegacyWorkspaceArchive({ sandboxId: resource.sandboxId, body });
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

async function archiveSandboxWithinLease(params: {
  resource: SandboxResourceDoc;
  lease: RedisLeaseContext;
  inactiveBefore?: Date;
  onClaim?: (resource: SandboxResourceDoc | null) => void;
}): Promise<SandboxArchiveSingleResult> {
  const { lease } = params;
  const current = await findSandboxInstanceBySandboxId({ sandboxId: params.resource.sandboxId });
  if (!current) {
    params.onClaim?.(null);
    return { status: 'skipped', reason: 'Sandbox record no longer exists' };
  }
  if (current.status === SandboxInstanceStatusEnum.archived) {
    params.onClaim?.(null);
    return { status: 'success' };
  }
  if (
    params.inactiveBefore &&
    (current.status !== SandboxInstanceStatusEnum.stopped ||
      current.lastActiveAt >= params.inactiveBefore)
  ) {
    params.onClaim?.(null);
    return { status: 'skipped', reason: 'Resource became active or changed state' };
  }
  if (
    current.status !== SandboxInstanceStatusEnum.running &&
    current.status !== SandboxInstanceStatusEnum.stopped &&
    current.status !== SandboxInstanceStatusEnum.archiving
  ) {
    params.onClaim?.(null);
    return { status: 'skipped', reason: `Sandbox is ${current.status}` };
  }
  if (current.status === SandboxInstanceStatusEnum.archiving) {
    const operation = current.metadata?.operation;
    const staleBefore = subMinutes(new Date(), SANDBOX_STALE_ARCHIVING_MINUTES);
    // Lease 过期不代表旧 Provider 请求已经终止，隔离窗口内禁止新执行者换 token 接管。
    if (!operation?.error && (!operation?.heartbeatAt || operation.heartbeatAt >= staleBefore)) {
      params.onClaim?.(null);
      return { status: 'skipped', reason: 'Sandbox archive operation is still active' };
    }
  }
  let sandbox: ISandbox | undefined;

  try {
    const definition: SandboxLifecycleDefinition = {
      operationType: SandboxOperationTypeEnum.archive,
      status: SandboxInstanceStatusEnum.archiving,
      steps: [
        {
          fromPhase: 'claimed',
          toPhase: 'archiveUploaded',
          run: async ({ resource: claimed }) => {
            const connected = await connectSandboxForArchive(claimed);
            sandbox = connected.sandbox;
            await ensureZipAvailableInSandbox(sandbox);
            const body = await createWorkspaceArchive({
              sandbox,
              workDirectory: connected.profile.workDirectory,
              sandboxId: claimed.sandboxId
            });
            await getS3SandboxSource().uploadWorkspaceArchive({
              sandboxId: claimed.sandboxId,
              body
            });
          }
        },
        {
          fromPhase: 'archiveUploaded',
          toPhase: 'providerDeleted',
          run: async ({ resource: claimed }) => {
            await deleteArchivedRemoteResource(claimed);
          }
        }
      ],
      finish: {
        type: 'complete',
        status: SandboxInstanceStatusEnum.archived,
        set: ({ resource: claimed }) => {
          const image = getSandboxRuntimeProfile(claimed.provider).defaultImage;
          return image ? { 'metadata.image': image } : {};
        }
      }
    };
    const completed = await runSandboxLifecycleOperation({
      resource: current,
      lease,
      definition,
      matchLastActiveAt: Boolean(params.inactiveBefore),
      onClaim: params.onClaim,
      allowClaimConflict: true
    });
    if (!completed) return { status: 'skipped', reason: 'Resource was modified or occupied' };
    return { status: 'success' };
  } catch (error) {
    const errorText = getErrText(error);
    logger.error('Failed to archive sandbox', {
      sandboxId: current.sandboxId,
      provider: current.provider,
      error
    });
    return { status: 'failed', error: errorText };
  } finally {
    if (sandbox) await disconnectSandbox(sandbox).catch(() => undefined);
  }
}

/** 归档单个 inactive sandbox。 */
export async function archiveSandboxResource(
  resource: SandboxResourceDoc,
  inactiveBefore: Date
): Promise<SandboxArchiveSingleResult> {
  return withSandboxLifecycleLease({
    sandboxId: resource.sandboxId,
    label: `archive-sandbox:${resource.sandboxId}`,
    fn: (lease) => archiveSandboxWithinLease({ resource, lease, inactiveBefore })
  });
}

/** provider 迁移持有 Lifecycle Lease 时复用同一归档流水线，避免嵌套锁。 */
export async function archiveSandboxResourceForProviderMigration(
  resource: SandboxResourceDoc,
  lease?: RedisLeaseContext
) {
  if (lease) return archiveSandboxWithinLease({ resource, lease });
  return withSandboxLifecycleLease({
    sandboxId: resource.sandboxId,
    label: `archive-provider-migration:${resource.sandboxId}`,
    fn: (context) => archiveSandboxWithinLease({ resource, lease: context })
  });
}

/** 用户触发 runtime 升级后后台持有 lease 完成归档。 */
export async function startSandboxRuntimeUpgradeArchive(
  resource: SandboxResourceDoc
): Promise<
  { success: true; archivingDoc: SandboxResourceDoc } | { success: false; error: string }
> {
  let resolveClaim!: (value: SandboxResourceDoc | null) => void;
  const claimReady = new Promise<SandboxResourceDoc | null>((resolve) => {
    resolveClaim = resolve;
  });
  let claimResolved = false;
  const background = withSandboxLifecycleLease({
    sandboxId: resource.sandboxId,
    label: `archive-runtime-upgrade:${resource.sandboxId}`,
    fn: async (lease) => {
      await archiveSandboxWithinLease({
        resource,
        lease,
        onClaim: (claimed) => {
          claimResolved = true;
          resolveClaim(claimed);
        }
      });
    }
  });
  void background.catch((error) => {
    if (!claimResolved) resolveClaim(null);
    logger.error('Runtime upgrade archive task failed', {
      sandboxId: resource.sandboxId,
      error
    });
  });

  const archivingDoc = await claimReady;
  return archivingDoc
    ? { success: true, archivingDoc }
    : { success: false, error: 'Resource was modified or occupied' };
}

/** 流式归档全部候选，并按固定并发执行。 */
async function archiveSandboxResources(inactiveBefore: Date) {
  const cursor = createSandboxResourcesToArchiveCursor(inactiveBefore);
  let batch: SandboxResourceDoc[] = [];

  const archiveBatch = async (resources: SandboxResourceDoc[]) => {
    await batchRun(
      resources,
      (resource) =>
        archiveSandboxResource(resource, inactiveBefore).catch((error) => {
          logger.error('Failed to execute sandbox archive task', {
            sandboxId: resource.sandboxId,
            provider: resource.provider,
            error
          });
        }),
      SANDBOX_ARCHIVE_BATCH_SIZE
    );
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
}

export async function archiveInactiveSandboxes(now = new Date()) {
  await archiveSandboxResources(subDays(now, SANDBOX_ARCHIVE_INACTIVE_DAYS));
}

/** 重试超过隔离窗口的 archiving operation。 */
export async function retryStaleArchivingSandboxes(now = new Date()) {
  const stale = await findStaleSandboxOperations({
    statuses: [SandboxInstanceStatusEnum.archiving],
    heartbeatBefore: subMinutes(now, SANDBOX_STALE_ARCHIVING_MINUTES)
  });
  return batchRun(
    stale,
    (resource) => archiveSandboxResourceForProviderMigration(resource),
    SANDBOX_ARCHIVE_BATCH_SIZE
  );
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

  return withSandboxLifecycleLease({
    sandboxId: params.sandboxId,
    label: `restore-sandbox:${params.sandboxId}`,
    fn: async (lease) => {
      const current = await findSandboxInstanceBySandboxId({ sandboxId: params.sandboxId });
      if (!current || current.status === SandboxInstanceStatusEnum.running) return;
      if (
        current.status !== SandboxInstanceStatusEnum.archived &&
        current.status !== SandboxInstanceStatusEnum.restoring
      ) {
        throw new SandboxLifecycleStateError(current.status);
      }
      if (
        current.status === SandboxInstanceStatusEnum.restoring &&
        !current.metadata?.operation?.error &&
        current.metadata?.operation?.heartbeatAt &&
        current.metadata.operation.heartbeatAt >=
          subMinutes(new Date(), SANDBOX_STALE_ARCHIVING_MINUTES)
      ) {
        throw new SandboxLifecycleStateError(current.status);
      }
      let sandbox: ISandbox | undefined;
      let restoredStorage = params.storage ?? current.storage;

      try {
        const definition: SandboxLifecycleDefinition = {
          operationType: SandboxOperationTypeEnum.restore,
          status: SandboxInstanceStatusEnum.restoring,
          steps: [
            {
              fromPhase: 'claimed',
              toPhase: 'archiveInstalled',
              run: async () => {
                const target = await createRestoreSandbox(params);
                sandbox = target.sandbox;
                restoredStorage ??= target.storage;
                await ensureUnzipAvailableInSandbox(target.sandbox);
                const body = await getS3SandboxSource().downloadWorkspaceArchive({
                  sandboxId: params.sandboxId,
                  maxBytes: getAgentSandboxArchiveMaxBytes()
                });
                await restoreWorkspaceArchive({
                  sandbox: target.sandbox,
                  workDirectory: target.profile.workDirectory,
                  sandboxId: params.sandboxId,
                  archiveBody: body
                });
              }
            }
          ],
          finish: {
            type: 'complete',
            status: SandboxInstanceStatusEnum.running,
            touchActive: true,
            set: () => ({
              provider: params.provider,
              sourceType: params.sourceType,
              sourceId: params.sourceId,
              userId: params.userId,
              ...(restoredStorage !== undefined ? { storage: restoredStorage } : {}),
              ...(params.resourceLimit ? { limit: params.resourceLimit } : {}),
              'metadata.volumeEnabled': Boolean(restoredStorage)
            })
          }
        };
        const completed = await runSandboxLifecycleOperation({
          resource: current,
          lease,
          definition,
          previousStatus: SandboxInstanceStatusEnum.archived,
          claimConflictError: new SandboxLifecycleStateError(current.status)
        });

        await getS3SandboxSource()
          .deleteWorkspaceArchiveNow({ sandboxId: params.sandboxId })
          .catch((error) => {
            logger.warn('Failed to delete consumed sandbox archive', {
              sandboxId: params.sandboxId,
              error
            });
          });
      } catch (error) {
        if (sandbox) await sandbox.stop().catch(() => undefined);
        throw error;
      } finally {
        if (sandbox) await disconnectSandbox(sandbox).catch(() => undefined);
      }
    }
  });
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
