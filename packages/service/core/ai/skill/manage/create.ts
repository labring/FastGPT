import { checkCreateResourceParent } from '../../../../common/parentFolder/depth';
import {
  AgentSkillCreationStatusEnum,
  AgentSkillSourceEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/ai/skill/constants';
import type { ClientSession } from '../../../../common/mongo';
import { MongoAgentSkills } from '../model/schema';
import type { CreateSkillData } from './types';

/**
 * 创建个人 Skill 元数据，写入前校验父级文件夹链，防止复制等入口绕过目录类型约束。
 *
 * This only creates metadata. Initial SKILL.md/package/version setup is owned by
 * import/copy/async creation flows so package storage stays consistent.
 */
export async function createSkill(data: CreateSkillData, session?: ClientSession): Promise<string> {
  const { skillId, ...createData } = data;
  await checkCreateResourceParent({
    parentId: createData.parentId,
    teamId: createData.teamId,
    model: {
      findById: (id, select) => MongoAgentSkills.findById(id, select).session(session ?? null)
    },
    isFolder: false,
    isFolderType: (type) => type === AgentSkillTypeEnum.folder
  });

  const skill = new MongoAgentSkills({
    ...(skillId && { _id: skillId }),
    ...createData,
    parentId: createData.parentId || null,
    type: AgentSkillTypeEnum.skill,
    source: AgentSkillSourceEnum.personal,
    creationStatus: createData.creationStatus ?? AgentSkillCreationStatusEnum.ready,
    updateTime: new Date()
  });
  await skill.save({ session });
  return skill._id.toString();
}
