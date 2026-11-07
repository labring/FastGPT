import { SOURCE_DELETE_CONCURRENCY } from '../../constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { batchRunSettled } from '@fastgpt/global/common/system/utils';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getLogger, LogCategories } from '../../../../../common/logger';
import {
  deleteSandboxResourcesBySource,
  deleteSkillEditSandboxes as deleteCurrentSkillSandboxes
} from '../../application/resource';
import { withSandboxSourceMutationLease } from '../../application/lease';
import { assertSandboxSourceDeleted } from '../../application/sourceGuard';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

/**
 * 分别在 App、Builder 的 Source lease 内确认 App 已删除，再查询、清理对应资源。
 *
 * 删除标记阻止后续创建；各自的 Source lease 确保查询不会漏掉正在创建的记录。
 * 按固定顺序逐个取得并释放 Source lease，内部保持 Source -> Lifecycle 的锁顺序。
 */
export async function deleteAppSandboxes(appId: string): Promise<void> {
  for (const sourceType of [ChatSourceTypeEnum.app, ChatSourceTypeEnum.workflowBuilder] as const) {
    await withSandboxSourceMutationLease({
      sourceType,
      sourceId: appId,
      label: `delete-app-sandboxes:${sourceType}:${appId}`,
      fn: async ({ assertValid }) => {
        await assertSandboxSourceDeleted({ sourceType, sourceId: appId });
        assertValid();
        await deleteSandboxResourcesBySource({ sourceType, sourceId: appId });
      }
    });
  }
}

/** 按 Skill source 独立持有 lease，清理所有已删除 Skill 的 Sandbox 资源。 */
export async function deleteSkillEditSandboxes(skillIds: string[]): Promise<void> {
  const results = await batchRunSettled(
    skillIds,
    async (skillId) => {
      await withSandboxSourceMutationLease({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        label: `delete-skill-sandbox:${skillId}`,
        fn: async ({ assertValid }) => {
          await assertSandboxSourceDeleted({
            sourceType: ChatSourceTypeEnum.skillEdit,
            sourceId: skillId
          });
          assertValid();
          await deleteCurrentSkillSandboxes([skillId]);
        }
      });
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
