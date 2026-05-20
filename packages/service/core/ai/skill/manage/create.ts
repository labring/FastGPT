import {
  AgentSkillCreationStatusEnum,
  AgentSkillSourceEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/ai/skill/constants';
import type { ClientSession } from '../../../../common/mongo';
import { MongoAgentSkills } from '../model/schema';
import type { CreateSkillData } from './types';

/**
 * Create a new personal skill record.
 *
 * This only creates metadata. Initial SKILL.md/package/version setup is owned by
 * import/copy/async creation flows so package storage stays consistent.
 */
export async function createSkill(data: CreateSkillData, session?: ClientSession): Promise<string> {
  const { skillId, ...createData } = data;
  const skill = new MongoAgentSkills({
    ...(skillId && { _id: skillId }),
    ...createData,
    parentId: createData.parentId || null,
    type: AgentSkillTypeEnum.skill,
    source: AgentSkillSourceEnum.personal,
    creationStatus: createData.creationStatus ?? AgentSkillCreationStatusEnum.ready,
    creationPayload: createData.creationPayload,
    updateTime: new Date()
  });
  await skill.save({ session });
  return skill._id.toString();
}
