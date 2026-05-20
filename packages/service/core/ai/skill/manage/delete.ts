import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import type { AgentSkillSchemaType } from '@fastgpt/global/core/ai/skill/type';
import type { ClientSession } from '../../../../common/mongo';
import { MongoAgentSkills } from '../model/schema';
import { findSkillAndAllChildren } from './folder';

/**
 * 将 skill 或 folder 子树标记为逻辑删除。
 *
 * 这里不做真正的外部资源清理。API 删除流程会先在 Mongo 事务中把整棵子树标记为删除，
 * 让列表、鉴权、运行时注入立即不可见；事务提交后再投递 MQ，由后台 worker 清理 S3、
 * 头像、sandbox、权限记录并最终硬删除 Mongo 数据。
 *
 * 版本表没有删除状态。主表 deleteTime 已足够让整个 skill 不可访问；
 * 后台 worker 会在最终清理阶段硬删除这些版本记录。
 */
export async function markSkillSubtreeDeleted(
  skillId: string,
  session?: ClientSession
): Promise<void> {
  const skillQuery = MongoAgentSkills.findOne({
    _id: skillId,
    deleteTime: null
  });
  if (session) skillQuery.session(session);
  const skill = await skillQuery;

  if (!skill) {
    throw new Error('Skill not found');
  }

  if (skill.source === AgentSkillSourceEnum.system) {
    throw new Error('Cannot delete system skill');
  }

  let deleteList: AgentSkillSchemaType[];
  if (skill.type === AgentSkillTypeEnum.folder) {
    deleteList = await findSkillAndAllChildren({
      teamId: skill.teamId!.toString(),
      skillId,
      session
    });
  } else {
    deleteList = [skill];
  }

  const deleteTime = new Date();
  const deleteIds = deleteList.map((s) => s._id);

  await MongoAgentSkills.updateMany(
    { _id: { $in: deleteIds }, deleteTime: null },
    { $set: { deleteTime } },
    { session }
  );
}

/**
 * 兼容旧调用名。
 *
 * 当前函数语义是“标记删除”，真正清理由 agentSkillDelete MQ worker 完成。
 */
export async function deleteSkill(skillId: string, session?: ClientSession): Promise<void> {
  return markSkillSubtreeDeleted(skillId, session);
}
