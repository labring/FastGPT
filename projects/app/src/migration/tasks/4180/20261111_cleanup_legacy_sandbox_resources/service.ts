/**
 * 任务 2（`20261111_cleanup_legacy_sandbox_resources`）单条旧资源回收服务层。
 */
import { SandboxVolumeNameSchema } from '@fastgpt/global/core/ai/sandbox/volume';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { getSessionVolumeClaimName } from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service';
import { serviceEnv } from '@fastgpt/service/env';
import { resolveLegacyOpenSandboxSourceConfig } from '../sandbox_migration_shared/env';
import { deleteLegacyWorkspaceArchive } from '../sandbox_migration_shared/legacyArchiveS3';
import {
  checkOpenSandboxConnectivity,
  terminateLegacyOpenSandboxContainers
} from '@fastgpt/service/core/ai/sandbox/legacy/legacyOpenSandbox';
import {
  buildMatchingV3SandboxFilter,
  extractRawLegacyWorkspaceClaimName,
  getLegacySandboxV2Collection,
  getLegacyV2WorkspaceClaimName,
  LegacySandboxV2DocSchema,
  LegacySandboxV2SourceTypeSchema,
  resolveActiveSandboxSourceTeamId
} from '../sandbox_migration_shared/legacySchema';
import {
  checkVolumeManagerHealth,
  deleteLegacyVolume
} from '../sandbox_migration_shared/legacyVolumeClient';
import { createLegacySealosClientFromEnv } from '../sandbox_migration_shared/sealosClient';

export type SingleLegacyCleanupOutcome = { outcome: 'cleaned' } | { outcome: 'already_cleaned' };

/**
 * 任务 2 启动前按 `v2` 实际包含的 Provider 类型校验外部服务连通性与凭证。
 */
export async function runLegacySandboxCleanupPreflight(params: {
  signal: AbortSignal;
}): Promise<void> {
  const v2Collection = getLegacySandboxV2Collection();

  const legacyOpenSandboxSource = resolveLegacyOpenSandboxSourceConfig();
  const hasOpenSandboxDoc = await v2Collection.findOne(
    { provider: 'opensandbox' },
    { projection: { _id: 1 } }
  );
  if (hasOpenSandboxDoc) {
    await checkVolumeManagerHealth(params.signal);
    await checkOpenSandboxConnectivity();
    if (legacyOpenSandboxSource) {
      await checkVolumeManagerHealth(params.signal, legacyOpenSandboxSource.volumeManager);
      await checkOpenSandboxConnectivity(legacyOpenSandboxSource.openSandbox);
    }
  }

  const hasSealosDoc = await v2Collection.findOne(
    { provider: 'sealosdevbox' },
    { projection: { _id: 1 } }
  );
  if (hasSealosDoc) {
    createLegacySealosClientFromEnv();
  }
}

/**
 * 幂等回收单条 `v2` 记录关联的全部旧物理资源，全部确认清理成功后删除该条 `v2` 文档。
 */
export async function cleanupSingleLegacySandboxRecord(params: {
  id: string;
  signal: AbortSignal;
}): Promise<SingleLegacyCleanupOutcome> {
  const v2Collection = getLegacySandboxV2Collection();
  const objectId = new Types.ObjectId(params.id);
  const raw = await v2Collection.findOne({ _id: objectId });
  if (!raw) {
    return { outcome: 'already_cleaned' };
  }

  const legacyOpenSandboxSource = resolveLegacyOpenSandboxSourceConfig();

  /** 回收指定 sandboxId 关联的外部物理资源（OpenSandbox 旧容器/旧卷、S3 冷归档、Sealos Devbox）。 */
  const reclaimLegacyPhysicalResources = async (resourceParams: {
    sandboxId: string;
    provider?: string;
    oldClaimName?: string;
    v3ClaimName?: string;
  }) => {
    const { sandboxId, provider, oldClaimName, v3ClaimName } = resourceParams;
    if (!sandboxId) return;

    // 1. 清理残留的无 deploymentId 旧版 OpenSandbox 容器（含跨集群旧源端与当前集群）。
    if (provider === 'opensandbox' && legacyOpenSandboxSource) {
      await terminateLegacyOpenSandboxContainers({
        sandboxId,
        endpoint: legacyOpenSandboxSource.openSandbox,
        signal: params.signal
      });
    }
    if (
      provider === 'opensandbox' ||
      (Boolean(serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL?.trim()) &&
        Boolean(serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE?.trim()))
    ) {
      await terminateLegacyOpenSandboxContainers({
        sandboxId,
        signal: params.signal
      });
    }

    // 2. 清理旧持久卷（同时覆盖持久化的 oldClaimName 与早期无代际后缀候选卷名；跨集群迁移时同步清理源端与目标端）。
    if (provider === 'opensandbox') {
      const candidateNames = new Set<string>();
      if (oldClaimName) {
        candidateNames.add(oldClaimName.toLowerCase());
      }
      const unsuffixedParsed = SandboxVolumeNameSchema.safeParse(
        `${serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX}-${sandboxId}`.toLowerCase()
      );
      if (unsuffixedParsed.success) {
        candidateNames.add(unsuffixedParsed.data);
      }
      if (v3ClaimName) {
        candidateNames.delete(v3ClaimName.toLowerCase());
      }

      for (const claimName of candidateNames) {
        params.signal.throwIfAborted();
        if (legacyOpenSandboxSource) {
          await deleteLegacyVolume(claimName, params.signal, {
            ...legacyOpenSandboxSource.volumeManager,
            allowLegacyV03Fallback: true
          });
        }
        await deleteLegacyVolume(claimName, params.signal);
      }
    }

    // 3. 清理 S3 冷归档包 sandbox/archive/<sandboxId>/package.zip（不存在视为幂等成功）。
    params.signal.throwIfAborted();
    await deleteLegacyWorkspaceArchive(sandboxId);

    // 4. 清理远端 Sealos Devbox 实例（404 视为已删除）。
    if (provider === 'sealosdevbox') {
      params.signal.throwIfAborted();
      await createLegacySealosClientFromEnv().delete(sandboxId, params.signal);
    }
  };

  const parsed = LegacySandboxV2DocSchema.safeParse(raw);
  if (!parsed.success) {
    // 若旧文档字段残缺，仅当已标记为 deleting 或关联业务源已软删除时，回收可识别外部资源后清理该孤儿文档；否则按失败阻断以免误删活跃沙箱。
    const rawRecord = raw as Record<string, unknown>;
    const rawSandboxId = typeof rawRecord.sandboxId === 'string' ? rawRecord.sandboxId.trim() : '';
    const rawProvider =
      typeof rawRecord.provider === 'string' ? rawRecord.provider.trim() : undefined;
    const rawOldClaimName = extractRawLegacyWorkspaceClaimName(rawRecord);
    const parsedSourceType = LegacySandboxV2SourceTypeSchema.safeParse(rawRecord.sourceType);
    const rawSourceId = typeof rawRecord.sourceId === 'string' ? rawRecord.sourceId.trim() : '';
    const isDeletedSource =
      parsedSourceType.success && Boolean(rawSourceId)
        ? !(await resolveActiveSandboxSourceTeamId({
            sourceType: parsedSourceType.data,
            sourceId: rawSourceId
          }))
        : false;
    if (rawRecord.status === 'deleting' || isDeletedSource) {
      await reclaimLegacyPhysicalResources({
        sandboxId: rawSandboxId,
        provider: rawProvider,
        oldClaimName: rawOldClaimName
      });
      await v2Collection.deleteOne({ _id: objectId });
      return { outcome: 'cleaned' };
    }
    throw parsed.error;
  }

  const v2Doc = parsed.data;
  const oldClaimName = getLegacyV2WorkspaceClaimName(v2Doc);
  const v3ClaimName = await (async () => {
    // 防御性安全护栏：若业务源仍存活且非 deleting，必须确认 v3 已落库且未引用旧卷名。
    if (v2Doc.status === 'deleting') return undefined;

    const activeTeamId = await resolveActiveSandboxSourceTeamId({
      sourceType: v2Doc.sourceType,
      sourceId: v2Doc.sourceId
    });
    if (!activeTeamId) return undefined;

    const v3Doc = await MongoSandboxInstance.findOne(buildMatchingV3SandboxFilter(v2Doc)).lean();
    if (!v3Doc) {
      throw new Error(
        `Refusing to clean active legacy sandbox ${v2Doc.sandboxId} before v3 record exists`
      );
    }
    const resolvedV3Claim = getSessionVolumeClaimName(v3Doc.storage);
    if (oldClaimName && resolvedV3Claim === oldClaimName) {
      throw new Error(
        `Refusing to delete legacy volume ${oldClaimName} because v3 record still references it`
      );
    }
    return resolvedV3Claim;
  })();

  await reclaimLegacyPhysicalResources({
    sandboxId: v2Doc.sandboxId,
    provider: v2Doc.provider,
    oldClaimName,
    v3ClaimName
  });

  // 上述外部物理资源全部确认回收后，删除对应的 v2 Mongo 文档（保留空集合）。
  await v2Collection.deleteOne({ _id: objectId });
  return { outcome: 'cleaned' };
}
