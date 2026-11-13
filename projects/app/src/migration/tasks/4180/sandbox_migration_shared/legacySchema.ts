/**
 * 旧集合 `agent_sandbox_instances_v2` 的只读解析、归属核验与删除访问器。
 *
 * 直接通过底层 Mongo 原生 Collection 访问，不注册 Mongoose Model，避免自动同步旧表索引。
 */
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SANDBOX_WORKSPACE_VOLUME_NAME } from '@fastgpt/global/core/ai/sandbox/volume';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import {
  resolveSandboxSourceTeamId,
  SandboxSourceMissingError
} from '@fastgpt/service/core/ai/sandbox/application/sourceGuard';
import { LEGACY_SANDBOX_V2_COLLECTION_NAME } from '@fastgpt/service/core/ai/sandbox/legacy/v2MigrationGate';
import { z } from 'zod';

export const LegacySandboxV2ProviderSchema = z.enum(['opensandbox', 'sealosdevbox']);
export type LegacySandboxV2Provider = z.infer<typeof LegacySandboxV2ProviderSchema>;

export const LegacySandboxV2StatusSchema = z.enum([
  'running',
  'stopping',
  'stopped',
  'provisioning',
  'deleting',
  'archiving',
  'archived',
  'restoring',
  'legacyMigrating'
]);
export type LegacySandboxV2Status = z.infer<typeof LegacySandboxV2StatusSchema>;

export const LegacySandboxV2SourceTypeSchema = z.enum([
  ChatSourceTypeEnum.app,
  ChatSourceTypeEnum.workflowBuilder,
  ChatSourceTypeEnum.skillEdit
]);

const LegacySandboxV2LimitSchema = z.object({
  cpuCount: z.number().optional(),
  memoryMiB: z.number().optional(),
  storageSize: z.string().optional()
});

const LegacySandboxV2VolumeSchema = z.object({
  name: z.string(),
  claimName: z.string().optional(),
  mountPath: z.string().optional()
});

const LegacySandboxV2StorageSchema = z.object({
  volumes: z.array(LegacySandboxV2VolumeSchema).optional(),
  mountPath: z.string().optional()
});

const LegacySandboxV2OperationSchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
  phase: z.string().optional(),
  previousStatus: z.string().optional()
});

export const LegacySandboxV2DocSchema = z.object({
  _id: z.preprocess(
    (val) => (val !== null && val !== undefined ? String(val) : val),
    z.string().min(1)
  ),
  provider: LegacySandboxV2ProviderSchema,
  sandboxId: z.string().min(1),
  sourceType: LegacySandboxV2SourceTypeSchema,
  sourceId: z.string().min(1),
  userId: z.string().min(1),
  status: LegacySandboxV2StatusSchema,
  lastActiveAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  limit: LegacySandboxV2LimitSchema.nullish(),
  storage: LegacySandboxV2StorageSchema.nullish(),
  versionId: z.string().nullish(),
  operation: LegacySandboxV2OperationSchema.nullish()
});

export type LegacySandboxV2Doc = z.infer<typeof LegacySandboxV2DocSchema>;

/** 获取 `agent_sandbox_instances_v2` 底层原生 Mongo Collection。 */
export function getLegacySandboxV2Collection() {
  const db = connectionMongo.connection.db;
  if (!db) {
    throw new Error('MongoDB connection is not ready for legacy sandbox v2 collection');
  }
  return db.collection(LEGACY_SANDBOX_V2_COLLECTION_NAME);
}

/** 提取旧版 `v2` 文档中记录的持久化工作区卷名（`claimName`）。 */
export function getLegacyV2WorkspaceClaimName(
  doc: Pick<LegacySandboxV2Doc, 'storage'>
): string | undefined {
  const volumes = doc.storage?.volumes;
  if (!volumes || volumes.length === 0) return undefined;

  const matched =
    volumes.find((item) => item.name === SANDBOX_WORKSPACE_VOLUME_NAME)?.claimName ??
    volumes[0]?.claimName;
  const trimmed = matched?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * 从未通过完整 Schema 校验的原始 `v2` 文档中安全提取 `storage.volumes[*].claimName`，
 * 供清理阶段回收残缺孤儿文档关联的旧 PVC / Docker Volume。
 */
export function extractRawLegacyWorkspaceClaimName(
  rawRecord: Record<string, unknown>
): string | undefined {
  const parsedStorage = LegacySandboxV2StorageSchema.safeParse(rawRecord.storage);
  if (!parsedStorage.success) return undefined;
  return getLegacyV2WorkspaceClaimName({ storage: parsedStorage.data });
}

/**
 * 解析沙箱关联业务源（App / WorkflowBuilder / SkillEdit）当前存活的 `teamId`；
 * 当业务源已软删除或不存在（`SandboxSourceMissingError`）时返回 `undefined`，数据库异常照常抛出。
 */
export async function resolveActiveSandboxSourceTeamId(params: {
  sourceType: z.infer<typeof LegacySandboxV2SourceTypeSchema>;
  sourceId: string;
}): Promise<string | undefined> {
  try {
    const teamId = await resolveSandboxSourceTeamId(params);
    return teamId || undefined;
  } catch (error) {
    if (error instanceof SandboxSourceMissingError) {
      return undefined;
    }
    throw error;
  }
}

/**
 * 构造任务 1（迁移判重 + 完成校验）与任务 2（清理前置护栏）共享的 `v3` 实例匹配条件，
 * 同时覆盖 `(sourceType, sourceId, userId)` 业务唯一键与 `sandboxId` 物理唯一键，防止多阶段判据不一致。
 */
export function buildMatchingV3SandboxFilter(
  doc: Pick<LegacySandboxV2Doc, 'sourceType' | 'sourceId' | 'userId' | 'sandboxId'>
) {
  return {
    $or: [
      {
        sourceType: doc.sourceType,
        sourceId: doc.sourceId,
        userId: doc.userId
      },
      {
        sandboxId: doc.sandboxId
      }
    ]
  };
}
