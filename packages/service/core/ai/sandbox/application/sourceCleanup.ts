import { getErrText } from '@fastgpt/global/common/error/utils';
import { batchRunSettled } from '@fastgpt/global/common/system/utils';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getLogger, LogCategories } from '../../../../common/logger';
import {
  deleteAppSandboxes as deleteCurrentAppSandboxes,
  deleteSkillEditSandboxes as deleteCurrentSkillSandboxes
} from './resource';
import { withSandboxSourceMutationLease } from './lease';
import { assertSandboxSourceDeleted } from './sourceGuard';

const SOURCE_DELETE_CONCURRENCY = 10;
const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

/** 在 Source lease 内校验 App 已删除，再清理其全部 Sandbox 资源。 */
export async function deleteAppSandboxes(appId: string): Promise<void> {
  await withSandboxSourceMutationLease({
    sourceType: ChatSourceTypeEnum.app,
    sourceId: appId,
    label: `delete-app-sandboxes:${appId}`,
    fn: async ({ assertValid }) => {
      await assertSandboxSourceDeleted({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId
      });
      assertValid();
      await deleteCurrentAppSandboxes(appId);
    }
  });
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
