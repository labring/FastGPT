/**
 * 任务 1（`20261111_migrate_sandbox_to_juicefs`）单条记录与前置检查服务层。
 */
import { redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { Types } from '@fastgpt/service/common/mongo';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { withSandboxLifecycleLease } from '@fastgpt/service/core/ai/sandbox/application/lease';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import {
  buildVolumeConfig,
  deleteSessionVolume,
  ensureSessionVolume,
  getOrphanVolumeMarkerKey,
  unmountSessionVolume
} from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service';
import { serviceEnv } from '@fastgpt/service/env';
import {
  getSandboxMigrationEnv,
  resolveLegacyOpenSandboxSourceConfig
} from '../sandbox_migration_shared/env';
import {
  inspectLegacyWorkspaceArchive,
  openLegacyWorkspaceArchiveWebStream
} from '../sandbox_migration_shared/legacyArchiveS3';
import {
  checkOpenSandboxConnectivity,
  terminateLegacyOpenSandboxContainers,
  withLegacyExportOpenSandbox,
  withTemporaryMigrationSandbox
} from '@fastgpt/service/core/ai/sandbox/legacy/legacyOpenSandbox';
import {
  buildMatchingV3SandboxFilter,
  getLegacySandboxV2Collection,
  LegacySandboxV2DocSchema,
  LegacySandboxV2SourceTypeSchema,
  resolveActiveSandboxSourceTeamId,
  type LegacySandboxV2Doc
} from '../sandbox_migration_shared/legacySchema';
import {
  checkLegacyVolumeExists,
  checkVolumeManagerHealth
} from '../sandbox_migration_shared/legacyVolumeClient';
import {
  createLegacySealosClientFromEnv,
  SealosDevboxNotFoundError
} from '../sandbox_migration_shared/sealosClient';
import {
  buildDualMountTarCopyCommand,
  buildSafeUntarGzToWorkspaceCommand,
  buildSafeUnzipToWorkspaceCommand,
  buildSealosRemotePackCommand,
  classifyLegacyV2MigrationSource,
  collectLegacyWorkspaceManifest,
  computeDeterministicV3ClaimName,
  syncLegacyWorkspaceManifestViaExecd
} from './utils';

const CONTAINER_TMP_ZIP_PATH = '/tmp/fastgpt-v3-migrate.zip';
const CONTAINER_TMP_TAR_PATH = '/tmp/fastgpt-v3-migrate.tar.gz';
const SEALOS_REMOTE_TMP_TAR_PATH = '/tmp/.fastgpt-v3-migrate.tar.gz';
const SANDBOX_MIGRATION_OP_TIMEOUT_SECONDS = 600;

export type SingleSandboxMigrationOutcome =
  | { outcome: 'migrated'; sandboxId: string }
  | { outcome: 'already_migrated'; sandboxId: string }
  | { outcome: 'skipped' };

/**
 * 判断 `v2` 表是否存在需要执行外部迁移或报告校验失败的候选文档。
 *
 * 当全表仅剩 `status === 'deleting'`，或少量残留记录所属 App / Skill / Workflow 均已软删除时，
 * 返回 `false` 供未启用沙箱的部署直接走免预检快路径完成升级。
 */
export async function hasLiveLegacyV2MigrationCandidate(maxScan: number): Promise<boolean> {
  const v2Collection = getLegacySandboxV2Collection();
  const candidates = await v2Collection
    .find({ status: { $ne: 'deleting' } }, { projection: { sourceType: 1, sourceId: 1 } })
    .limit(maxScan + 1)
    .toArray();
  if (candidates.length === 0) return false;
  if (candidates.length > maxScan) return true;

  for (const raw of candidates) {
    const record = raw as Record<string, unknown>;
    const parsedSourceType = LegacySandboxV2SourceTypeSchema.safeParse(record.sourceType);
    const rawSourceId = typeof record.sourceId === 'string' ? record.sourceId.trim() : '';
    if (!parsedSourceType.success || !rawSourceId) {
      return true;
    }

    const liveTeamId = await resolveActiveSandboxSourceTeamId({
      sourceType: parsedSourceType.data,
      sourceId: rawSourceId
    });
    if (liveTeamId) {
      return true;
    }
  }

  return false;
}

/**
 * 执行任务 1 启动前的环境变量与外部基础设施连通性检查。
 *
 * 仅在确认 `v2` 存在待处理文档时由编排入口调用。
 */
export async function runSandboxMigrationPreflight(params: { signal: AbortSignal }): Promise<void> {
  // 1. 校验新版 OpenSandbox 与 volume-manager 必填配置及连通性。
  if (!serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL?.trim()) {
    throw new Error('AGENT_SANDBOX_OPENSANDBOX_BASEURL must be configured before migration');
  }
  if (!serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE?.trim()) {
    throw new Error('AGENT_SANDBOX_OPENSANDBOX_IMAGE is required before migration');
  }
  await checkVolumeManagerHealth(params.signal);
  await checkOpenSandboxConnectivity();

  // 2. 若配置了跨运行时 / 跨集群旧版 OpenSandbox 源端（如旧 Docker -> 新 K8s），校验成对配置并在存在存量 opensandbox 记录时预检连通性。
  const legacyOpenSandboxSource = resolveLegacyOpenSandboxSourceConfig();
  const v2Collection = getLegacySandboxV2Collection();
  if (legacyOpenSandboxSource) {
    const hasLiveOpenSandboxDoc = await v2Collection.findOne(
      {
        provider: 'opensandbox',
        status: { $ne: 'deleting' }
      },
      { projection: { _id: 1 } }
    );
    if (hasLiveOpenSandboxDoc) {
      await checkVolumeManagerHealth(params.signal, legacyOpenSandboxSource.volumeManager);
      await checkOpenSandboxConnectivity(legacyOpenSandboxSource.openSandbox);
    }
  }

  // 3. 仅当存量 v2 含有实际需走远端 Devbox 直拉分支（非已上传 S3 归档）的记录时，强制校验 Sealos 凭证。
  const hasLiveSealosDoc = await v2Collection.findOne(
    {
      provider: 'sealosdevbox',
      $or: [
        { status: { $in: ['running', 'stopping', 'stopped', 'provisioning'] } },
        { status: 'archiving', 'operation.phase': 'claimed' }
      ]
    },
    { projection: { _id: 1 } }
  );
  if (hasLiveSealosDoc) {
    createLegacySealosClientFromEnv();
  }
}

async function migrateFromOpenSandboxLegacyVolume(params: {
  doc: LegacySandboxV2Doc;
  oldClaimName?: string;
  newClaimName: string;
  signal: AbortSignal;
}): Promise<void> {
  const { doc, oldClaimName, newClaimName, signal } = params;
  const legacySource = resolveLegacyOpenSandboxSourceConfig();

  // 1. 先终止无 deploymentId 的旧版 OpenSandbox 容器，释放云厂商 RWO 块存储或 Docker 卷锁。
  if (legacySource) {
    await terminateLegacyOpenSandboxContainers({
      sandboxId: doc.sandboxId,
      endpoint: legacySource.openSandbox,
      signal
    });
  }
  await terminateLegacyOpenSandboxContainers({ sandboxId: doc.sandboxId, signal });

  // 2. 无旧 claimName 时仅允许早期未完成分配卷的 provisioning 记录初始化空 JuiceFS 卷。
  if (!oldClaimName) {
    if (doc.status !== 'provisioning') {
      throw new Error(
        `Legacy OpenSandbox record ${doc.sandboxId} (status=${doc.status}) has no workspace claimName`
      );
    }
    await ensureSessionVolume(newClaimName);
    if (serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME === 'docker') {
      await unmountSessionVolume(newClaimName).catch(() => {});
    }
    return;
  }

  // 3. 跨运行时 / 跨集群场景（如旧 Docker OpenSandbox -> 新 K8s OpenSandbox）：
  //    无法由同一 Pod 双挂载 Docker 本地卷与 K8s JuiceFS PVC，改为通过源/目标 execd 直接枚举并流式同步（零 /tmp 中转包）。
  if (legacySource) {
    const legacyExists = await checkLegacyVolumeExists(oldClaimName, signal, {
      ...legacySource.volumeManager,
      allowMissingRouteFallback: legacySource.openSandbox.runtime === 'docker'
    });
    if (!legacyExists) {
      throw new Error(`Legacy OpenSandbox volume not found: ${oldClaimName}`);
    }

    await withLegacyExportOpenSandbox({
      sandboxId: doc.sandboxId,
      legacyClaimName: oldClaimName,
      endpoint: legacySource.openSandbox,
      signal,
      fn: async (legacyOps) => {
        const manifest = await collectLegacyWorkspaceManifest({
          legacyOps,
          signal
        });

        await ensureSessionVolume(newClaimName);
        if (manifest.isEmpty) {
          if (serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME === 'docker') {
            await unmountSessionVolume(newClaimName).catch(() => {});
          }
          return;
        }

        await withTemporaryMigrationSandbox({
          sandboxId: doc.sandboxId,
          newClaimName,
          signal,
          fn: async (targetOps) => {
            await syncLegacyWorkspaceManifestViaExecd({
              manifest,
              legacyOps,
              targetOps,
              signal
            });
          }
        });
      }
    });
    return;
  }

  // 4. 同集群场景：预检旧卷物理存在后拉起双挂载临时迁移容器，通过 tar 流式直拷数据。
  const legacyExists = await checkLegacyVolumeExists(oldClaimName, signal);
  if (!legacyExists) {
    throw new Error(`Legacy OpenSandbox volume not found: ${oldClaimName}`);
  }

  await ensureSessionVolume(newClaimName);
  await withTemporaryMigrationSandbox({
    sandboxId: doc.sandboxId,
    newClaimName,
    legacyClaimName: oldClaimName,
    signal,
    fn: async ({ exec }) => {
      await exec(buildDualMountTarCopyCommand(), SANDBOX_MIGRATION_OP_TIMEOUT_SECONDS);
    }
  });
}

async function migrateFromLegacyS3Archive(params: {
  doc: LegacySandboxV2Doc;
  newClaimName: string;
  signal: AbortSignal;
}): Promise<void> {
  const { doc, newClaimName, signal } = params;

  // 1. 核验 S3 归档对象存在（404 记入 failedRecords）。
  const archiveInfo = await inspectLegacyWorkspaceArchive(doc.sandboxId);
  if (!archiveInfo.exists) {
    throw new Error(`Legacy S3 workspace archive package.zip not found for ${doc.sandboxId}`);
  }

  // 2. 清理可能残留的旧版计算容器（若是跨集群 OpenSandbox 或 sealosdevbox，同步清理源端残留运行态）。
  const legacySource = resolveLegacyOpenSandboxSourceConfig();
  if (doc.provider === 'opensandbox' && legacySource) {
    await terminateLegacyOpenSandboxContainers({
      sandboxId: doc.sandboxId,
      endpoint: legacySource.openSandbox,
      signal
    });
  }
  await terminateLegacyOpenSandboxContainers({ sandboxId: doc.sandboxId, signal });
  if (doc.provider === 'sealosdevbox') {
    const { sealosBaseUrl, sealosToken } = getSandboxMigrationEnv();
    if (sealosBaseUrl && sealosToken) {
      await createLegacySealosClientFromEnv()
        .pause(doc.sandboxId, signal)
        .catch(() => {});
    }
  }

  // 3. 确保目标 JuiceFS 卷存在；22 字节空归档直接完成，无需拉起临时容器。
  await ensureSessionVolume(newClaimName);
  if (archiveInfo.isEmptyZip) {
    if (serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME === 'docker') {
      await unmountSessionVolume(newClaimName).catch(() => {});
    }
    return;
  }

  // 4. 流式将 S3 zip 管道传入临时容器 /tmp，执行防 Zip Slip 校验与过滤解压（临时容器按 2 倍工作区基数放大 ephemeral-storage）。
  await withTemporaryMigrationSandbox({
    sandboxId: doc.sandboxId,
    newClaimName,
    ephemeralStorageWorkspaceMultiplier: 2,
    signal,
    fn: async ({ exec, uploadStream }) => {
      const archiveStream = await openLegacyWorkspaceArchiveWebStream(archiveInfo.key);
      try {
        await uploadStream(CONTAINER_TMP_ZIP_PATH, archiveStream.stream);
      } finally {
        archiveStream.close();
      }
      await exec(
        buildSafeUnzipToWorkspaceCommand({
          zipPath: CONTAINER_TMP_ZIP_PATH
        }),
        SANDBOX_MIGRATION_OP_TIMEOUT_SECONDS
      );
    }
  });
}

async function migrateFromSealosDevbox(params: {
  doc: LegacySandboxV2Doc;
  newClaimName: string;
  signal: AbortSignal;
}): Promise<void> {
  const { doc, newClaimName, signal } = params;
  const sealosClient = createLegacySealosClientFromEnv();
  const { sealosWorkDirectory } = getSandboxMigrationEnv();

  let commandReady = false;
  let instanceMissing = false;
  try {
    // 1. 唤醒暂停中的远端 Devbox 并等待命令通道就绪（纳入 try/finally，确保探针超时也能在 finally 中恢复暂停态）。
    await sealosClient.resumeAndWaitReady({ name: doc.sandboxId, signal }).catch((error) => {
      if (error instanceof SealosDevboxNotFoundError) {
        instanceMissing = true;
      }
      throw error;
    });
    commandReady = true;

    // 2. 在远端 Devbox 内打包工作区。
    const packResult = await sealosClient.exec({
      name: doc.sandboxId,
      command: [
        'sh',
        '-c',
        buildSealosRemotePackCommand({
          workDirectory: sealosWorkDirectory,
          remoteTarPath: SEALOS_REMOTE_TMP_TAR_PATH
        })
      ],
      timeoutSeconds: SANDBOX_MIGRATION_OP_TIMEOUT_SECONDS,
      signal
    });
    if (packResult.exitCode !== 0) {
      const rawDetail = (packResult.stderr || packResult.stdout).trim();
      const detail =
        rawDetail.length > 600 ? `${rawDetail.slice(0, 160)}\n${rawDetail.slice(-400)}` : rawDetail;
      throw new Error(`Sealos Devbox workspace tar failed (${packResult.exitCode}): ${detail}`);
    }

    await ensureSessionVolume(newClaimName);
    const trimmedPackOut = packResult.stdout.trim();
    if (trimmedPackOut === 'EMPTY_WORKDIR') {
      if (serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME === 'docker') {
        await unmountSessionVolume(newClaimName).catch(() => {});
      }
      return;
    }
    if (!/^\d+$/.test(trimmedPackOut)) {
      throw new Error(
        `Sealos Devbox returned invalid tar byte size for ${doc.sandboxId}: ${trimmedPackOut || '<empty>'}`
      );
    }
    const expectedBytes = Number(trimmedPackOut);
    if (expectedBytes === 0) {
      throw new Error(`Sealos Devbox produced empty 0-byte tar archive for ${doc.sandboxId}`);
    }

    // 3. 流式桥接下载流至本地临时容器 /tmp（按 2 倍工作区基数放大 ephemeral-storage），落地校验完整字节数（防 SPDY/chunked 截断）后防穿越解压。
    await withTemporaryMigrationSandbox({
      sandboxId: doc.sandboxId,
      newClaimName,
      ephemeralStorageWorkspaceMultiplier: 2,
      signal,
      fn: async ({ exec, uploadStream }) => {
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          signal.throwIfAborted();
          const downloadStream = await sealosClient.downloadFileWebStream({
            name: doc.sandboxId,
            path: SEALOS_REMOTE_TMP_TAR_PATH,
            timeoutSeconds: SANDBOX_MIGRATION_OP_TIMEOUT_SECONDS,
            signal
          });
          await uploadStream(CONTAINER_TMP_TAR_PATH, downloadStream);

          const sizeCheck = await exec(`wc -c < ${shellQuote(CONTAINER_TMP_TAR_PATH)}`, 30);
          const actualBytes = Number(sizeCheck.stdout.trim());
          if (!Number.isFinite(actualBytes) || actualBytes !== expectedBytes) {
            if (attempt < maxAttempts) {
              await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
              continue;
            }
            throw new Error(
              `Sealos Devbox tar stream truncated for ${doc.sandboxId}: expected ${expectedBytes} bytes, got ${sizeCheck.stdout.trim() || 'NaN'}`
            );
          }
          break;
        }

        await exec(
          buildSafeUntarGzToWorkspaceCommand({
            tarGzPath: CONTAINER_TMP_TAR_PATH,
            oldWorkDirectory: sealosWorkDirectory
          }),
          SANDBOX_MIGRATION_OP_TIMEOUT_SECONDS
        );
      }
    });
  } finally {
    // 4. 清理远端临时 tar 包并将 Devbox 置为 Paused 释放算力（保留磁盘供回滚）。
    if (commandReady) {
      await sealosClient
        .exec({
          name: doc.sandboxId,
          command: ['rm', '-f', '--', SEALOS_REMOTE_TMP_TAR_PATH],
          timeoutSeconds: 15
        })
        .catch(() => {});
    }
    if (!instanceMissing) {
      await sealosClient.pause(doc.sandboxId).catch(() => {});
    }
  }
}

/**
 * 迁移单条 `v2` 沙箱实例到 `v3`（JuiceFS + 纯 OpenSandbox `stopped` 记录）。
 *
 * 全程不删除 `v2` 记录、旧卷、S3 归档包或远端 Devbox 磁盘，确保任务 2 触发前可无损回滚。
 */
export async function migrateSingleLegacySandboxRecord(params: {
  id: string;
  signal: AbortSignal;
}): Promise<SingleSandboxMigrationOutcome> {
  const v2Collection = getLegacySandboxV2Collection();
  const raw = await v2Collection.findOne({ _id: new Types.ObjectId(params.id) });
  if (!raw) {
    return { outcome: 'skipped' };
  }

  const v2Doc = LegacySandboxV2DocSchema.parse(raw);
  const plan = classifyLegacyV2MigrationSource(v2Doc);
  if (plan.kind === 'skip_deleting') {
    return { outcome: 'skipped' };
  }

  const oldClaimName = plan.kind === 'opensandbox_volume' ? plan.oldClaimName : undefined;
  const newClaimName = computeDeterministicV3ClaimName({
    v2ObjectId: v2Doc._id,
    sandboxId: v2Doc.sandboxId,
    oldClaimName
  });

  // 1. 快检业务源（App / AgentSkills）是否存活并解析当前归属 teamId；已软删除则直接跳过并兜底回收上次中断可能残留的目标空卷（与 validation / cleanup 阶段对齐，不因已删除应用的 legacyMigrating 阻塞升级）。
  const resolvedTeamId = await resolveActiveSandboxSourceTeamId({
    sourceType: v2Doc.sourceType,
    sourceId: v2Doc.sourceId
  });
  if (!resolvedTeamId) {
    const hasV3 = await MongoSandboxInstance.exists(buildMatchingV3SandboxFilter(v2Doc));
    if (!hasV3) {
      await deleteSessionVolume(newClaimName).catch(() => {});
    }
    return { outcome: 'skipped' };
  }

  if (plan.kind === 'fail_legacy_v1') {
    throw new Error(
      `Sandbox ${v2Doc.sandboxId} is stuck in legacy v1 migration state (legacyMigrating)`
    );
  }

  // 2. 在单实例 Lifecycle Lease 内执行搬迁与 v3 原子写入，防止与反向孤儿容器 GC 或前台请求冲突。
  return withSandboxLifecycleLease({
    sandboxId: v2Doc.sandboxId,
    label: 'system-migration:v2-to-v3',
    fn: async (lease) => {
      params.signal.throwIfAborted();
      lease.assertValid();

      const existingV3 = await MongoSandboxInstance.findOne(
        buildMatchingV3SandboxFilter(v2Doc)
      ).lean();
      if (existingV3) {
        return { outcome: 'already_migrated', sandboxId: v2Doc.sandboxId };
      }

      // 3. 搬迁期间定期清除孤儿卷观察标记，防止超长拷贝（>30min）在 v3 文档落库前被孤儿卷 GC 误删；异常时回滚新卷。
      const orphanMarkerKey = getOrphanVolumeMarkerKey(newClaimName);
      const orphanMarkerGuard = setInterval(() => {
        void redisCacheAdapter.delete(orphanMarkerKey).catch(() => undefined);
      }, 5 * 60_000);
      orphanMarkerGuard.unref?.();

      const createdV3Id = await (async () => {
        try {
          if (plan.kind === 'opensandbox_volume') {
            await migrateFromOpenSandboxLegacyVolume({
              doc: v2Doc,
              oldClaimName,
              newClaimName,
              signal: params.signal
            });
          } else if (plan.kind === 's3_archive') {
            await migrateFromLegacyS3Archive({
              doc: v2Doc,
              newClaimName,
              signal: params.signal
            });
          } else {
            await migrateFromSealosDevbox({
              doc: v2Doc,
              newClaimName,
              signal: params.signal
            });
          }

          lease.assertValid();
          const targetImage = serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE?.trim();
          if (!targetImage) {
            throw new Error('AGENT_SANDBOX_OPENSANDBOX_IMAGE is required to persist v3 record');
          }

          const resourceLimits =
            v2Doc.limit?.cpuCount !== undefined || v2Doc.limit?.memoryMiB !== undefined
              ? {
                  ...(v2Doc.limit.cpuCount !== undefined ? { cpuCount: v2Doc.limit.cpuCount } : {}),
                  ...(v2Doc.limit.memoryMiB !== undefined
                    ? { memoryMiB: v2Doc.limit.memoryMiB }
                    : {})
                }
              : undefined;
          const createdV3 = await MongoSandboxInstance.create({
            sandboxId: v2Doc.sandboxId,
            sourceType: v2Doc.sourceType,
            sourceId: v2Doc.sourceId,
            userId: v2Doc.userId,
            status: 'stopped',
            lastActiveAt: v2Doc.lastActiveAt,
            createdAt: v2Doc.createdAt,
            ...(resourceLimits ? { resourceLimits } : {}),
            storage: buildVolumeConfig(newClaimName).storage,
            teamId: resolvedTeamId,
            image: targetImage,
            ...(v2Doc.versionId ? { context: { skillVersionId: v2Doc.versionId } } : {})
          });
          return createdV3._id;
        } catch (error) {
          await deleteSessionVolume(newClaimName).catch(() => {});
          throw error;
        } finally {
          clearInterval(orphanMarkerGuard);
        }
      })();

      const latestTeamId = await resolveActiveSandboxSourceTeamId({
        sourceType: v2Doc.sourceType,
        sourceId: v2Doc.sourceId
      });
      if (!latestTeamId) {
        await MongoSandboxInstance.deleteOne({ _id: createdV3Id });
        await deleteSessionVolume(newClaimName).catch(() => {});
        return { outcome: 'skipped' };
      }
      if (latestTeamId !== resolvedTeamId) {
        await MongoSandboxInstance.updateOne(
          { _id: createdV3Id },
          { $set: { teamId: latestTeamId } }
        );
      }

      return { outcome: 'migrated', sandboxId: v2Doc.sandboxId };
    }
  });
}
