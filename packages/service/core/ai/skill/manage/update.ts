import { AgentSkillCreationStatusEnum } from '@fastgpt/global/core/ai/skill/constants';
import type { ClientSession } from '../../../../common/mongo';
import { MongoAgentSkills } from '../model/schema';
import type { UpdateSkillData } from './types';

/**
 * Update skill metadata.
 *
 * This function intentionally does not update SKILL.md/package content. Content
 * changes must go through version/deploy flows so the current version pointer stays valid.
 */
export async function updateSkill(
  skillId: string,
  data: UpdateSkillData,
  session?: ClientSession
): Promise<void> {
  const updateData = {
    ...data,
    updateTime: new Date()
  };

  await MongoAgentSkills.updateOne(
    { _id: skillId, deleteTime: null },
    { $set: updateData },
    { session }
  );
}

/**
 * 将当前可用的 version id 绑定到 skill，并把创建状态标记为 ready。
 *
 * 这里返回 matchedCount，而不是在 skill 行消失时抛错。异步创建可能在用户删除
 * pending skill 后才完成，调用方会依赖这个 boolean 判断刚上传的包是否需要清理。
 */
export async function updateCurrentVersion(
  skillId: string,
  currentVersionId: string,
  session?: ClientSession
): Promise<boolean> {
  const result = await MongoAgentSkills.updateOne(
    { _id: skillId, deleteTime: null },
    {
      $set: {
        currentVersionId,
        creationStatus: AgentSkillCreationStatusEnum.ready,
        updateTime: new Date()
      },
      $unset: {
        creationError: '',
        creationPayload: ''
      }
    },
    { session }
  );

  return result.matchedCount > 0;
}

/**
 * 将异步创建的 skill 标记为失败，并保留可见行用于删除和问题诊断。
 *
 * creationPayload 可能包含用户输入的生成要求。记录终态失败后，保留短错误文本
 * 已足够支撑 UI 展示，同时避免继续保存不必要的生成输入。
 */
export async function updateSkillCreationFailed({
  skillId,
  error,
  session
}: {
  skillId: string;
  error: string;
  session?: ClientSession;
}): Promise<void> {
  await MongoAgentSkills.updateOne(
    { _id: skillId, deleteTime: null },
    {
      $set: {
        creationStatus: AgentSkillCreationStatusEnum.failed,
        creationError: error,
        updateTime: new Date()
      },
      $unset: {
        creationPayload: ''
      }
    },
    { session }
  );
}
