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
 * 确认 App 已打软删除标记后，按 App / WorkflowBuilder 维度清理对应 Sandbox 资源。
 *
 * 依赖 Store-Load 持久栅栏：新建侧落库 `provisioning` 后会再次校验 source 未删除，
 * 删除侧先确认主表已标记删除，再扫描并逐个持有 Lifecycle Lease 执行回收。
 */
export async function deleteAppSandboxes(appId: string): Promise<void> {
  for (const sourceType of [ChatSourceTypeEnum.app, ChatSourceTypeEnum.workflowBuilder] as const) {
    await assertSandboxSourceDeleted({ sourceType, sourceId: appId });
    await deleteSandboxResourcesBySource({ sourceType, sourceId: appId });
  }
}

/** 确认 Skill 已打软删除标记后，清理所有已删除 Skill 的 Sandbox 资源。 */
export async function deleteSkillEditSandboxes(skillIds: string[]): Promise<void> {
  if (skillIds.length === 0) return;

  const results = await batchRunSettled(
    skillIds,
    async (skillId) => {
      await assertSandboxSourceDeleted({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId
      });
    },
    SOURCE_DELETE_CONCURRENCY
  );

  const failures: Array<{ skillId: string; error: string }> = [];
  const verifiedSkillIds: string[] = [];

  results.forEach((result, index) => {
    const skillId = skillIds[index];
    if (result.success) {
      verifiedSkillIds.push(skillId);
      return;
    }
    failures.push({
      skillId,
      error: getErrText(result.error, 'Unknown Skill Sandbox cleanup error')
    });
  });

  if (verifiedSkillIds.length > 0) {
    try {
      await deleteCurrentSkillSandboxes(verifiedSkillIds);
    } catch (error) {
      const errorText = getErrText(error, 'Unknown Skill Sandbox cleanup error');
      for (const skillId of verifiedSkillIds) {
        failures.push({ skillId, error: errorText });
      }
    }
  }

  if (failures.length === 0) return;

  logger.error('Failed to clean up Skill Sandbox sources', {
    failureCount: failures.length,
    failures
  });
  throw new Error(`Failed to clean up ${failures.length} Skill Sandbox sources`);
}
