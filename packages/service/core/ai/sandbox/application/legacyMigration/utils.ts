/** Legacy migration 纯函数：负责 preflight、身份和状态转换，不执行持久化或远端操作。 */
import { generateSandboxId, SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  LegacySandboxInstanceZodSchema,
  type LegacySandboxInstanceSchemaType
} from '../../infrastructure/instance/legacySchema';
import {
  SandboxInstanceStatusEnum,
  SandboxMetadataSchema,
  SandboxProviderSchema
} from '../../type';
import type { LegacyMigrationPhase } from './types';

/** 在产生任何迁移副作用前校验整张 Legacy 表。 */
export const parseLegacySandboxInstances = (
  rawDocs: unknown[]
): LegacySandboxInstanceSchemaType[] => {
  const parsedDocs: LegacySandboxInstanceSchemaType[] = [];
  const failures: string[] = [];
  for (const rawDoc of rawDocs) {
    const parsed = LegacySandboxInstanceZodSchema.safeParse(rawDoc);
    if (parsed.success) {
      parsedDocs.push(parsed.data);
      continue;
    }
    const doc = rawDoc && typeof rawDoc === 'object' ? (rawDoc as Record<string, unknown>) : {};
    failures.push(
      `_id=${String(doc._id ?? 'unknown')}, sandboxId=${String(doc.sandboxId ?? 'unknown')} [${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ')}]`
    );
  }
  if (failures.length) {
    throw new Error(
      [
        `Legacy Sandbox preflight validation failed for ${failures.length} record(s)`,
        ...failures
      ].join('\n')
    );
  }
  return parsedDocs;
};

export const getLegacyMigrationPhase = (
  doc: LegacySandboxInstanceSchemaType
): LegacyMigrationPhase => doc.metadata?.userLevelMigration?.phase ?? 'pending';

/** 根据 Legacy 业务归属计算预归档和安装阶段共享的确定性目标 ID。 */
export const getLegacyMigrationTargetSandboxId = (doc: LegacySandboxInstanceSchemaType) =>
  generateSandboxId({
    sourceType: doc.sourceType,
    sourceId: doc.sourceId,
    userId:
      doc.sourceType === ChatSourceTypeEnum.skillEdit ? ChatSourceTypeEnum.skillEdit : doc.userId
  });

/** 删除 Legacy 专用 metadata，只保留 v2 schema 接受的稳定字段。 */
export const toV2Metadata = (metadata?: LegacySandboxInstanceSchemaType['metadata']) => {
  const {
    archive: _archive,
    migration: _migration,
    provider: _provider,
    skillId: _skillId,
    userLevelMigration: _userLevelMigration,
    ...stableMetadata
  } = metadata ?? {};
  return SandboxMetadataSchema.parse(stableMetadata);
};

/** 把 Legacy 记录转换成 Provider archive/delete 接受的物理资源。 */
export const toLegacyResource = (doc: LegacySandboxInstanceSchemaType) => ({
  provider: SandboxProviderSchema.parse(doc.provider),
  sandboxId: doc.sandboxId,
  status: doc.status ?? SandboxStatusEnum.stopped,
  lastActiveAt: doc.lastActiveAt ?? new Date(0),
  metadata: doc.metadata
});

export const isStableSandboxStatus = (status?: string) =>
  status === SandboxInstanceStatusEnum.running ||
  status === SandboxInstanceStatusEnum.stopped ||
  status === SandboxInstanceStatusEnum.archived;
