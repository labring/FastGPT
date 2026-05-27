import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import type { AgentSkillSchemaType } from '@fastgpt/global/core/ai/skill/type';
import type { ClientSession } from '../../../../common/mongo';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';
import { getLogger, LogCategories } from '../../../../common/logger';
import { MongoAgentSkills } from '../model/schema';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.CREATION);

/**
 * 递归查询一个 skill/folder 及其所有子节点。
 *
 * 删除、移动和权限同步都会依赖这个子树快照。传入 session 时，整棵树的读取会参与同一个
 * Mongo transaction，避免删除流程在事务内写入、事务外读子节点造成不一致。
 */
export async function findSkillAndAllChildren({
  teamId,
  skillId,
  fields,
  includeDeleted = false,
  session
}: {
  teamId: string;
  skillId: string;
  fields?: string;
  includeDeleted?: boolean;
  session?: ClientSession;
}): Promise<AgentSkillSchemaType[]> {
  const deleteFilter = includeDeleted ? {} : { deleteTime: null };

  const find = async (id: string): Promise<AgentSkillSchemaType[]> => {
    const childrenQuery = MongoAgentSkills.find(
      {
        teamId,
        parentId: id,
        ...deleteFilter
      },
      fields
    );
    if (session) childrenQuery.session(session);
    const children = await childrenQuery.lean();

    let skills: AgentSkillSchemaType[] = children as AgentSkillSchemaType[];

    for (const child of children) {
      const grandChildren = await find(child._id);
      skills = skills.concat(grandChildren);
    }

    return skills;
  };

  const skillQuery = MongoAgentSkills.findOne({ _id: skillId, teamId, ...deleteFilter }, fields);
  if (session) skillQuery.session(session);

  const [skill, childSkills] = await Promise.all([skillQuery.lean(), find(skillId)]);

  if (!skill) {
    throw new Error('Skill not found');
  }

  return [skill as AgentSkillSchemaType, ...childSkills];
}

/**
 * Create a skill folder.
 */
export async function createSkillFolder(
  data: {
    name: string;
    description?: string;
    parentId?: string | null;
    teamId: string;
    tmbId: string;
  },
  session?: ClientSession
): Promise<AgentSkillSchemaType> {
  const { name, description, parentId, teamId, tmbId } = data;

  const folder = new MongoAgentSkills({
    type: AgentSkillTypeEnum.folder,
    source: AgentSkillSourceEnum.personal,
    parentId: parentId || null,
    name,
    description: description || '',
    category: [],
    teamId,
    tmbId,
    createTime: new Date(),
    updateTime: new Date()
  });

  await folder.save({ session });
  return folder.toObject() as AgentSkillSchemaType;
}

/**
 * Get folder path from a skill/folder to root.
 */
export async function getSkillFolderPath(
  skillId: string | null,
  type: 'current' | 'parent'
): Promise<{ parentId: string | null; parentName: string }[]> {
  if (!skillId) {
    return [];
  }

  const skill = await MongoAgentSkills.findById(skillId, 'name parentId type');
  if (!skill) {
    return [];
  }

  const targetId = type === 'current' ? skillId : (skill.parentId ?? null);
  return await getParents(targetId);
}

async function getParents(
  parentId: string | null
): Promise<{ parentId: string | null; parentName: string }[]> {
  if (!parentId) {
    return [];
  }

  const parent = await MongoAgentSkills.findById(parentId, 'name parentId');
  if (!parent) {
    return [];
  }

  const paths = await getParents(parent.parentId ?? null);
  paths.push({ parentId, parentName: parent.name });

  return paths;
}

/**
 * Update parent folders' updateTime recursively.
 *
 * This is fire-and-forget because it only improves list ordering; primary
 * skill mutations should not fail because ancestor timestamp refresh fails.
 */
export const updateParentFoldersUpdateTime = ({ parentId }: { parentId?: string | null }) => {
  mongoSessionRun(async (session) => {
    const existsId = new Set<string>();
    let currentId: string | null | undefined = parentId;
    while (true) {
      if (!currentId || existsId.has(currentId)) return;

      existsId.add(currentId);

      const parentSkill = await MongoAgentSkills.findById(currentId, 'parentId updateTime');
      if (!parentSkill) return;

      parentSkill.updateTime = new Date();
      await parentSkill.save({ session });

      currentId = parentSkill.parentId ?? null;
    }
  }).catch((err) => {
    logger.error('Failed to update parent folder updateTime', { error: err });
  });
};
