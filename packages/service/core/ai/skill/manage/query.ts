import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import type { AgentSkillSchemaType } from '@fastgpt/global/core/ai/skill/type';
import { MongoAgentSkills } from '../model/schema';

/**
 * Get a live skill by ID.
 */
export async function getSkillById(skillId: string): Promise<AgentSkillSchemaType | null> {
  const skill = await MongoAgentSkills.findOne({
    _id: skillId,
    deleteTime: null
  }).lean();

  return skill as AgentSkillSchemaType | null;
}

/**
 * Check if user can modify/delete a skill.
 *
 * This is a narrow ownership helper; API routes should prefer authSkill for
 * full permission and inheritance semantics.
 */
export async function canModifySkill(skillId: string, tmbId: string): Promise<boolean> {
  const skill = await MongoAgentSkills.findOne({
    _id: skillId,
    deleteTime: null
  });

  if (!skill) {
    return false;
  }

  if (skill.source === AgentSkillSourceEnum.system) {
    return false;
  }

  return skill.tmbId?.toString() === tmbId;
}

/**
 * Check if skill/folder name already exists in the same parent folder.
 */
export async function checkSkillNameExists(
  name: string,
  teamId: string,
  parentId: string | null,
  excludeId?: string
): Promise<boolean> {
  const query: Record<string, any> = {
    name,
    teamId,
    parentId: parentId || null,
    deleteTime: null,
    source: AgentSkillSourceEnum.personal
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const count = await MongoAgentSkills.countDocuments(query);
  return count > 0;
}
