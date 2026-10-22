/**
 * Sandbox Workspace 归档与恢复。
 *
 * 远端副作用始终在 Lifecycle Lease 内、Mongo operation 抢占之后执行。
 */
import {
  SANDBOX_ARCHIVE_BATCH_SIZE,
  SandboxInstanceStatusEnum,
  SANDBOX_OPERATION_ISOLATION_MS,
  SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS,
  SANDBOX_ARCHIVE_DIRECTORY_TIMEOUT_MS
} from '../constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { subDays } from 'date-fns';
import type { ISandbox, SandboxCreateSpec } from '@fastgpt-sdk/sandbox-adapter';
import type { RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getS3SandboxSource } from '../../../../common/s3/sources/sandbox';
import { getAgentSandboxArchiveInactiveDays, getAgentSandboxArchiveMaxBytes } from '../config';
import {
  createSandboxResourcesToArchiveCursor,
  findSandboxInstanceBySandboxId,
  findStaleSandboxOperations,
  type SandboxResourceDoc
} from '../infrastructure/instance/repository';
import { resolveSandboxRuntimeImage } from './runtime/image';
import { getSandboxAdapterConfig } from '../infrastructure/provider/config';
import { buildSandboxResourceAdapter } from '../infrastructure/provider/adapter';
import { connectToSandbox, disconnectSandbox } from '../infrastructure/provider/lifecycle';
import { getSandboxRuntimeProfile } from '../infrastructure/provider/runtimeProfile';
import {
  buildVolumeConfig,
  createSessionVolumeClaimName,
  deleteSessionVolume,
  getSessionVolumeClaimName,
  getSessionVolumeConfig
} from '../infrastructure/volume/service';
import { type SandboxInstanceSchemaType, type SandboxProviderType } from '../type';

import { joinSandboxPath } from '../utils';
import { withSandboxLifecycleLease } from './lease';
import { runSandboxLifecycleOperation, type SandboxLifecycleDefinition } from './lifecycle/runner';

import { SandboxOperationSettledError, SandboxOperationConflictError } from './lifecycle/error';
import { canResumeSandboxOperation } from './lifecycle/utils';
import type { OwnedSandboxResource } from './runtime/type';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

const TEMP_ARCHIVE_FILE = '.fastgpt-sandbox-archive.zip';
const RESTORE_ARCHIVE_FILE = '.fastgpt-sandbox-restore.zip';
const EMPTY_ZIP_BUFFER = Buffer.from('504b0506000000000000000000000000000000000000', 'hex');
const ARCHIVE_TEMP_FILE_NAMES = [TEMP_ARCHIVE_FILE, RESTORE_ARCHIVE_FILE];

type SandboxPhysicalResource = Pick<
  SandboxResourceDoc,
  'provider' | 'sandboxId' | 'status' | 'lastActiveAt' | 'storage'
> & {
  metadata?: unknown;
};

type SandboxArchiveSingleResult =
  | { status: 'success'; resource: SandboxResourceDoc }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string };

const runSandboxCommand = async (
  sandbox: ISandbox,
  command: string,
  options: { timeoutMs?: number; maxOutputBytes?: number; signal?: AbortSignal } = {}
) => {
  const result = await sandbox.execute(command, {
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    maxOutputBytes: options.maxOutputBytes
  });
  if (result.exitCode !== 0) {
    const message = result.stderr || result.stdout || `Sandbox command failed: ${command}`;
    if (result.exitCode !== null) throw new SandboxOperationSettledError(message);
    throw new Error(message);
  }
  return result;
};

/** 归档前确保历史镜像中存在 zip。 */
const ensureZipAvailableInSandbox = async (sandbox: ISandbox, signal: AbortSignal) => {
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
    signal,
    timeoutMs: SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS,
    maxOutputBytes: 8 * 1024
  });
};

/** 恢复前确保镜像中存在 unzip。 */
const ensureUnzipAvailableInSandbox = async (sandbox: ISandbox, signal: AbortSignal) => {
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
    signal,
    timeoutMs: SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS,
    maxOutputBytes: 8 * 1024
  });
};

async function buildArchiveRuntimeConfig(resource: SandboxPhysicalResource) {
  const profile = getSandboxRuntimeProfile(resource.provider);
  const vmConfig = await (async () => {
    if (resource.provider !== 'opensandbox') return;
    const claimName = getSessionVolumeClaimName(resource.storage);
    if (!claimName) {
      throw new Error(`OpenSandbox ${resource.sandboxId} has no persisted workspace claimName`);
    }
    return getSessionVolumeConfig(claimName);
  })();
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
async function connectSandboxForArchive(
  resource: SandboxPhysicalResource,
  assertValid: () => void
) {
  const { profile, providerConfig, createConfig } = await buildArchiveRuntimeConfig(resource);
  assertValid();
  return {
    sandbox: await connectToSandbox(providerConfig, resource.sandboxId, createConfig),
    profile
  };
}

/** 只删除远端 Provider，volume 清理由独立 checkpoint 确认。 */
async function deleteSandboxProviderResource(resource: SandboxResourceDoc) {
  await buildSandboxResourceAdapter(resource).delete();
}

/** 删除 Mongo 中明确记录的 workspace volume，不推测其他 generation 的名称。 */
async function deleteSandboxVolumeResource(resource: SandboxResourceDoc) {
  if (resource.provider !== 'opensandbox') return;
  const claimName = getSessionVolumeClaimName(resource.storage);
  if (!claimName) {
    throw new Error(`OpenSandbox ${resource.sandboxId} has no persisted workspace claimName`);
  }
  await deleteSessionVolume(claimName);
}

async function createWorkspaceArchive(params: {
  sandbox: ISandbox;
  workDirectory: string;
  sandboxId: string;
  assertValid: () => void;
  signal: AbortSignal;
}) {
  const { signal, sandbox, workDirectory, sandboxId } = params;
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

  await runSandboxCommand(sandbox, `mkdir -p ${quotedWorkDirectory}`, {
    signal,
    timeoutMs: SANDBOX_ARCHIVE_DIRECTORY_TIMEOUT_MS
  });
  params.assertValid();
  await sandbox.deleteFiles([archivePath]).catch(() => undefined);
  const [sizeResult, entryCountResult] = await Promise.all([
    runSandboxCommand(
      sandbox,
      `cd ${quotedWorkDirectory} && find . -type f ${findExcludes} -ls 2>/dev/null | awk '{s+=$7} END {print s+0}'`,
      { signal, timeoutMs: SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS, maxOutputBytes: 8 * 1024 }
    ),
    runSandboxCommand(
      sandbox,
      `cd ${quotedWorkDirectory} && find . -mindepth 1 ${findExcludes} 2>/dev/null | wc -l`,
      { signal, timeoutMs: SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS, maxOutputBytes: 8 * 1024 }
    )
  ]);
  const workspaceBytes = Number.parseInt(sizeResult.stdout.trim(), 10);
  const entryCount = Number.parseInt(entryCountResult.stdout.trim(), 10);
  if (Number.isFinite(entryCount) && entryCount === 0) return EMPTY_ZIP_BUFFER;
  if (Number.isFinite(workspaceBytes) && workspaceBytes > maxArchiveBytes) {
    throw new Error('Sandbox workspace is too large');
  }

  params.assertValid();
  await runSandboxCommand(
    sandbox,
    `cd ${quotedWorkDirectory} && zip -r -y -q ${quotedArchiveFile} . ${zipExcludes}`,
    { signal, timeoutMs: SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS, maxOutputBytes: 8 * 1024 }
  );
  const [archive] = await sandbox.readFiles([archivePath]);
  if (archive.error) throw new Error(`Failed to read sandbox archive: ${archive.error.message}`);
  const archiveBuffer = Buffer.from(archive.content);
  if (archiveBuffer.byteLength > maxArchiveBytes) throw new Error('Sandbox archive is too large');
  params.assertValid();
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
  assertValid: () => void;
  signal: AbortSignal;
}) {
  const { signal, sandbox, workDirectory, sandboxId, archiveBody } = params;
  const archivePath = joinSandboxPath(workDirectory, RESTORE_ARCHIVE_FILE);
  const quotedWorkDirectory = shellQuote(workDirectory);
  const quotedArchiveFile = shellQuote(RESTORE_ARCHIVE_FILE);
  await runSandboxCommand(sandbox, `mkdir -p ${quotedWorkDirectory}`, {
    signal,
    timeoutMs: SANDBOX_ARCHIVE_DIRECTORY_TIMEOUT_MS
  });
  params.assertValid();
  const [writeResult] = await sandbox.writeFiles([{ path: archivePath, data: archiveBody }]);
  if (writeResult.error) {
    throw new Error(`Failed to write sandbox archive: ${writeResult.error.message}`);
  }
  params.assertValid();
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
    signal,
    timeoutMs: SANDBOX_ARCHIVE_COMMAND_TIMEOUT_MS,
    maxOutputBytes: 8 * 1024
  }).catch(async (error) => {
    params.assertValid();
    await sandbox.deleteFiles([archivePath]).catch(() => undefined);
    throw error;
  });
  logger.info('Sandbox workspace restored from archive', { sandboxId });
}

async function archiveSandboxWithinLease(params: {
  resource: SandboxResourceDoc;
  lease: RedisLeaseContext;
  inactiveBefore?: Date;
  onClaim?: (resource: SandboxResourceDoc | null) => void;
}): Promise<SandboxArchiveSingleResult> {
  const { lease } = params;
  const current = params.resource;
  if (current.status === SandboxInstanceStatusEnum.archived) {
    params.onClaim?.(null);
    return { status: 'success', resource: current };
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
    // Lease 过期不代表旧 Provider 请求已经终止，隔离窗口内禁止新执行者换 token 接管。
    if (!canResumeSandboxOperation(current)) {
      params.onClaim?.(null);
      return { status: 'skipped', reason: 'Sandbox archive operation is still active' };
    }
  }
  let sandbox: ISandbox | undefined;

  try {
    const definition: SandboxLifecycleDefinition = {
      status: SandboxInstanceStatusEnum.archiving,
      steps: [
        {
          fromPhase: 'claimed',
          toPhase: 'archiveUploaded',
          run: async ({ resource: claimed, assertValid }) => {
            const connected = await connectSandboxForArchive(claimed, assertValid);
            sandbox = connected.sandbox;
            assertValid();
            await ensureZipAvailableInSandbox(sandbox, lease.signal);
            assertValid();
            const body = await createWorkspaceArchive({
              sandbox,
              workDirectory: connected.profile.workDirectory,
              sandboxId: claimed.sandboxId,
              signal: lease.signal,
              assertValid
            });
            assertValid();
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
            await deleteSandboxProviderResource(claimed);
          }
        },
        {
          fromPhase: 'providerDeleted',
          toPhase: 'volumeDeleted',
          run: async ({ resource: claimed }) => {
            await deleteSandboxVolumeResource(claimed);
          }
        }
      ],
      finish: {
        type: 'complete',
        status: SandboxInstanceStatusEnum.archived,
        set: ({ resource: claimed }) => {
          const image = getSandboxRuntimeProfile(claimed.provider).defaultImage;
          return image ? { image } : {};
        }
      }
    };
    const completed = await runSandboxLifecycleOperation({
      resource: current,
      lease,
      definition,
      claim: { type: 'claim', matchLastActiveAt: Boolean(params.inactiveBefore) },
      onClaim: params.onClaim
    });
    return { status: 'success', resource: completed };
  } catch (error) {
    if (error instanceof SandboxOperationConflictError) {
      params.onClaim?.(null);
      return { status: 'skipped', reason: 'Resource was modified or occupied' };
    }
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

/** 公开入口取得锁后重读；锁内编排直接消费当前快照，避免重复查询。 */
async function readAndArchiveSandbox(params: {
  resource: SandboxResourceDoc;
  lease: RedisLeaseContext;
  inactiveBefore?: Date;
  onClaim?: (resource: SandboxResourceDoc | null) => void;
}): Promise<SandboxArchiveSingleResult> {
  const resource = await findSandboxInstanceBySandboxId({ sandboxId: params.resource.sandboxId });
  if (!resource) {
    params.onClaim?.(null);
    return { status: 'skipped', reason: 'Sandbox record no longer exists' };
  }
  return archiveSandboxWithinLease({ ...params, resource });
}

/** 归档单个 inactive sandbox。 */
export async function archiveSandboxResource(
  resource: SandboxResourceDoc,
  inactiveBefore: Date
): Promise<SandboxArchiveSingleResult> {
  return withSandboxLifecycleLease({
    sandboxId: resource.sandboxId,
    label: `archive-sandbox:${resource.sandboxId}`,
    fn: (lease) => readAndArchiveSandbox({ resource, lease, inactiveBefore })
  });
}

/** 调用方已经持有 Lifecycle Lease 时复用标准归档流水线，避免嵌套锁。 */
export async function archiveSandboxResourceWithinLease(
  resource: SandboxResourceDoc,
  lease: RedisLeaseContext
) {
  return archiveSandboxWithinLease({ resource, lease });
}

/** 不带 inactive 条件立即执行或接管标准归档流水线。 */
export async function archiveSandboxResourceNow(resource: SandboxResourceDoc) {
  return withSandboxLifecycleLease({
    sandboxId: resource.sandboxId,
    label: `archive-sandbox-now:${resource.sandboxId}`,
    fn: (context) => readAndArchiveSandbox({ resource, lease: context })
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
      await readAndArchiveSandbox({
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
  await archiveSandboxResources(subDays(now, getAgentSandboxArchiveInactiveDays()));
}

/** 重试超过隔离窗口的 archiving operation。 */
export async function retryStaleArchivingSandboxes(now = new Date()) {
  const stale = await findStaleSandboxOperations({
    statuses: [SandboxInstanceStatusEnum.archiving],
    now,
    heartbeatBefore: new Date(now.getTime() - SANDBOX_OPERATION_ISOLATION_MS.archive)
  });
  return batchRun(
    stale,
    (resource) => archiveSandboxResourceNow(resource),
    SANDBOX_ARCHIVE_BATCH_SIZE
  );
}

/** 在已持有 restore lifecycle lease 的 step 内准备 volume 并创建恢复 Sandbox。 */
async function createRestoreSandbox(params: {
  provider: SandboxProviderType;
  sandboxId: string;
  claimName?: string;
  createConfig?: SandboxCreateSpec;
  assertValid: () => void;
}) {
  const vmConfig = await (async () => {
    if (params.provider !== 'opensandbox') return;
    if (!params.claimName) {
      throw new Error(`OpenSandbox ${params.sandboxId} has no assigned workspace claimName`);
    }
    return getSessionVolumeConfig(params.claimName);
  })();
  params.assertValid();
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
    vmConfig
  };
}

/**
 * 在运行编排已有的 lifecycle lease 内恢复归档。
 * resource 是锁内读取并确认 Provider/归属后的真值；新 generation 先 checkpoint 后创建。
 * 返回最新实例记录，调用方按其 storage 构造运行连接。
 */
export async function restoreArchivedSandboxWithinLease(params: {
  resource: OwnedSandboxResource;
  lease: RedisLeaseContext;
  resourceLimit?: Partial<NonNullable<SandboxInstanceSchemaType['limit']>>;
  createConfig?: SandboxCreateSpec;
}) {
  const { resource, lease } = params;
  const runtimeImage = resolveSandboxRuntimeImage({
    provider: resource.provider,
    sandboxId: resource.sandboxId,
    createConfig: params.createConfig
  });
  let sandbox: ISandbox | undefined;
  try {
    return await runSandboxLifecycleOperation({
      resource,
      lease,
      claim: { type: 'claim', previousStatus: 'archived' },
      definition: {
        status: 'restoring',
        steps: [
          {
            fromPhase: 'claimed',
            toPhase: 'volumeAssigned',
            run: async ({ resource: claimed }) => ({
              ...(claimed.provider === 'opensandbox'
                ? {
                    storage: buildVolumeConfig(
                      createSessionVolumeClaimName({ sandboxId: claimed.sandboxId })
                    ).storage
                  }
                : {}),
              ...(runtimeImage ? { image: runtimeImage } : {}),
              ...(params.resourceLimit ? { limit: params.resourceLimit } : {})
            })
          },
          {
            fromPhase: 'volumeAssigned',
            toPhase: 'archiveInstalled',
            run: async ({ resource: claimed, assertValid }) => {
              const target = await createRestoreSandbox({
                provider: claimed.provider,
                sandboxId: claimed.sandboxId,
                claimName: getSessionVolumeClaimName(claimed.storage),
                createConfig: params.createConfig,
                assertValid
              });
              sandbox = target.sandbox;
              assertValid();
              await ensureUnzipAvailableInSandbox(sandbox, lease.signal);
              assertValid();
              const body = await getS3SandboxSource().downloadWorkspaceArchive({
                sandboxId: claimed.sandboxId,
                maxBytes: getAgentSandboxArchiveMaxBytes()
              });
              assertValid();
              await restoreWorkspaceArchive({
                sandbox,
                workDirectory: target.profile.workDirectory,
                sandboxId: claimed.sandboxId,
                archiveBody: body,
                signal: lease.signal,
                assertValid
              });
            }
          }
        ],
        finish: { type: 'complete', status: 'running', touchActive: true }
      }
    });
  } finally {
    if (sandbox) await disconnectSandbox(sandbox).catch(() => undefined);
  }
}
