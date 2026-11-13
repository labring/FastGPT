import { SOURCE_DELETE_CONCURRENCY } from '../../constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { batchRunSettled } from '@fastgpt/global/common/system/utils';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getLogger, LogCategories } from '../../../../../common/logger';
import {
  deleteSandboxResourcesBySource,
  deleteSkillEditSandboxes as deleteCurrentSkillSandboxes
} from '../../application/resource';
import { assertSandboxSourceDeleted } from '../../application/sourceGuard';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

/**
 * 清理已软删除 App 关联的全部用户沙盒与调试沙盒资源。
 *
 * 与创建端通过 MongoDB Store-Load 屏障无锁协同（无需跨用户 Source 锁）：
 * - 删除端：先由主事务写入 `MongoApp.deleteTime != null`（`assertSandboxSourceDeleted` 校验），再扫描 `MongoSandboxInstance`，并逐实例有界等待 `Lifecycle Lease` 完成彻底删除。
 * - 创建端：在 `Lifecycle Lease` 内先插入 `provisioning` 占位，再复检 `deleteTime === null`；若已删除则原子回撤占位记录并拒绝分配远端资源。
 */
export async function deleteAppSandboxes(appId: string): Promise<void> {
  for (const sourceType of [ChatSourceTypeEnum.app, ChatSourceTypeEnum.workflowBuilder] as const) {
    await assertSandboxSourceDeleted({ sourceType, sourceId: appId });
    await deleteSandboxResourcesBySource({ sourceType, sourceId: appId });
  }
}

/** 校验各 Skill 已持久化软删除标记后，并发清理其关联的全部 Skill Edit 沙盒资源。 */
export async function deleteSkillEditSandboxes(skillIds: string[]): Promise<void> {
  const results = await batchRunSettled(
    skillIds,
    async (skillId) => {
      await assertSandboxSourceDeleted({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId
      });
      await deleteCurrentSkillSandboxes([skillId]);
    },
    SOURCE_DELETE_CONCURRENCY
  );

  const failures = results.flatMap((result, index) => {
    if (result.success) return [];
    return [
      {
        skillId: skillIds[index],
        error: getErrText(result.error, 'Unknown Skill Sandbox cleanup error')
      }
    ];
  });
  if (failures.length === 0) return;

  logger.error('Failed to clean up Skill Sandbox sources', {
    failureCount: failures.length,
    failures
  });
  throw new Error(`Failed to clean up ${failures.length} Skill Sandbox sources`);
}
