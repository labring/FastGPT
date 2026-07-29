/** beta6 Legacy Sandbox 归属归一化，作为用户级 Workspace 迁移的第 0 阶段。 */
import { getErrText } from '@fastgpt/global/common/error/utils';
import { batchRunSettled } from '@fastgpt/global/common/system/utils';
import { SandboxTypeEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getS3SandboxSource } from '../../../../../common/s3/sources/sandbox';
import {
  cleanupNormalizedLegacySandboxFields,
  countLegacySandboxFieldCleanups,
  countPendingLegacySandboxNormalizations,
  deleteLegacySandboxInstanceRecord,
  findLegacySandboxesPendingSourceNormalization,
  updateLegacySandboxSources,
  type LegacySandboxNormalizationDoc,
  type LegacySandboxSourceUpdate
} from '../../infrastructure/instance/legacyRepository';
import { buildSandboxResourceAdapter } from '../../infrastructure/provider/adapter';
import { deleteSessionVolume } from '../../infrastructure/volume/service';
import { withSandboxLifecycleLease } from '../lease';
import { cleanupLegacySkillDebugChats } from './debugChatCleanup';
import type { LegacySandboxNormalizationResult } from './types';

const LEGACY_SANDBOX_NORMALIZATION_CONCURRENCY = 10;
type LegacySandboxFieldNormalizationResult = Omit<
  LegacySandboxNormalizationResult,
  'sandboxPendingCount' | 'legacyDebugChatCleanup'
>;

/** 按 beta6 兼容规则解析缺失 source 的旧记录；无法解析的记录视为孤儿资源。 */
const resolveLegacySandboxSource = (
  doc: LegacySandboxNormalizationDoc
): Omit<LegacySandboxSourceUpdate, 'id'> | undefined => {
  const appId = doc.appId ? String(doc.appId) : undefined;
  const metadataSkillId = doc.metadata?.skillId || undefined;

  if (doc.type === SandboxTypeEnum.editDebug) {
    const sourceId = metadataSkillId || appId;
    if (!sourceId) return;
    return {
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId
    };
  }
  if (!appId) return;
  return {
    sourceType: ChatSourceTypeEnum.app,
    sourceId: appId
  };
};

/**
 * 幂等删除无法归属的 Legacy Sandbox。
 *
 * Mongo 记录最后删除，确保任一远端清理失败后仍会被阶段后计数捕获并允许重试。
 */
const deleteLegacyOrphanSandbox = async (doc: LegacySandboxNormalizationDoc) => {
  await withSandboxLifecycleLease({
    sandboxId: doc.sandboxId,
    label: `delete-legacy-orphan-sandbox:${doc.sandboxId}`,
    fn: async ({ assertValid }) => {
      assertValid();
      await buildSandboxResourceAdapter(doc).delete();
      assertValid();
      if (doc.provider === 'opensandbox') {
        await deleteSessionVolume(doc.sandboxId);
        assertValid();
      }
      await getS3SandboxSource().deleteLegacyWorkspaceArchiveNow({ sandboxId: doc.sandboxId });
      assertValid();
      await deleteLegacySandboxInstanceRecord(doc._id);
    }
  });
};

/** 执行或预检 beta6 Sandbox 字段归一化。 */
async function normalizeLegacySandboxFields(params: {
  dryRun: boolean;
  assertLeaseValid?: () => void;
}): Promise<LegacySandboxFieldNormalizationResult> {
  const assertLeaseValid = params.assertLeaseValid ?? (() => undefined);
  assertLeaseValid();
  const [docs, legacyFieldMatchedCount] = await Promise.all([
    findLegacySandboxesPendingSourceNormalization(),
    countLegacySandboxFieldCleanups()
  ]);
  const sourceUpdates = docs.flatMap((doc) => {
    const source = resolveLegacySandboxSource(doc);
    return source ? [{ id: doc._id, ...source }] : [];
  });
  const sourceUpdateIds = new Set(sourceUpdates.map((operation) => String(operation.id)));
  const orphanDocs = docs.filter((doc) => !sourceUpdateIds.has(String(doc._id)));
  const skillUpdates = sourceUpdates.filter(
    (operation) => operation.sourceType === ChatSourceTypeEnum.skillEdit
  );
  const appUpdates = sourceUpdates.filter(
    (operation) => operation.sourceType === ChatSourceTypeEnum.app
  );

  if (params.dryRun) {
    return {
      skillMatchedCount: skillUpdates.length,
      skillModifiedCount: 0,
      appMatchedCount: appUpdates.length,
      appModifiedCount: 0,
      legacyFieldMatchedCount,
      legacyFieldModifiedCount: 0,
      orphanMatchedCount: orphanDocs.length,
      orphanDeletedCount: 0,
      orphanFailedCount: 0,
      pendingCount: await countPendingLegacySandboxNormalizations(),
      failures: []
    };
  }

  assertLeaseValid();
  const [skillUpdateResult, appUpdateResult] = await Promise.all([
    updateLegacySandboxSources(skillUpdates),
    updateLegacySandboxSources(appUpdates)
  ]);
  const legacyFieldCleanupResult = await cleanupNormalizedLegacySandboxFields();
  assertLeaseValid();
  const orphanDeleteResults = await batchRunSettled(
    orphanDocs,
    async (doc) => {
      assertLeaseValid();
      await deleteLegacyOrphanSandbox(doc);
      assertLeaseValid();
    },
    LEGACY_SANDBOX_NORMALIZATION_CONCURRENCY
  );
  const failures = orphanDeleteResults.flatMap((result, index) =>
    result.success
      ? []
      : [{ sandboxId: orphanDocs[index].sandboxId, error: getErrText(result.error) }]
  );
  assertLeaseValid();

  return {
    skillMatchedCount: skillUpdates.length,
    skillModifiedCount: skillUpdateResult?.modifiedCount ?? 0,
    appMatchedCount: appUpdates.length,
    appModifiedCount: appUpdateResult?.modifiedCount ?? 0,
    legacyFieldMatchedCount,
    legacyFieldModifiedCount: legacyFieldCleanupResult.modifiedCount,
    orphanMatchedCount: orphanDocs.length,
    orphanDeletedCount: orphanDeleteResults.filter((result) => result.success).length,
    orphanFailedCount: failures.length,
    pendingCount: await countPendingLegacySandboxNormalizations(),
    failures
  };
}

/**
 * 依次执行 beta6 Sandbox 字段归一化与旧 Skill Debug Chat 清理。
 *
 * `pendingCount` 合并 Sandbox 记录和旧 Debug Chat 的剩余数；只有总数归零才能进入
 * Workspace 归档。dry-run 只统计，现存的待处理数会直接阻断后续阶段。
 */
export async function normalizeLegacySandboxes(params: {
  dryRun: boolean;
  assertLeaseValid?: () => void;
}): Promise<LegacySandboxNormalizationResult> {
  const sandboxNormalization = await normalizeLegacySandboxFields(params);
  params.assertLeaseValid?.();
  const debugChatCleanup = await cleanupLegacySkillDebugChats({ dryRun: params.dryRun });
  params.assertLeaseValid?.();

  return {
    ...sandboxNormalization,
    sandboxPendingCount: sandboxNormalization.pendingCount,
    legacyDebugChatCleanup: debugChatCleanup.cleanup,
    pendingCount: sandboxNormalization.pendingCount + debugChatCleanup.cleanup.pendingChatCount
  };
}
