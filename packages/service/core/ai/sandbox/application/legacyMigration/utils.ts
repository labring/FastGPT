/** Legacy migration 纯函数：负责身份和状态转换，不执行持久化或远端操作。 */
import { generateSandboxId, SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { LegacySandboxInstanceSchemaType } from '../../infrastructure/instance/legacySchema';
import { SandboxInstanceStatusEnum, SandboxProviderSchema } from '../../type';
import type { LegacyMigrationPhase } from './types';

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

/** 只把 v2 支持的稳定根字段映射到目标实例，Legacy metadata 不会随 rest 泄漏。 */
export const toV2SandboxFields = (metadata?: LegacySandboxInstanceSchemaType['metadata']) => ({
  ...(metadata?.teamId !== undefined ? { teamId: metadata.teamId } : {}),
  ...(metadata?.versionId !== undefined ? { versionId: metadata.versionId } : {})
});

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
