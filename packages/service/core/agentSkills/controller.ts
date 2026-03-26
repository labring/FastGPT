import { MongoAgentSkills } from './schema';
import { MongoAgentSkillsVersion } from './version/schema';
import {
  AgentSkillSourceEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/agentSkills/constants';
import type { AgentSkillSchemaType, SkillPackageType } from '@fastgpt/global/core/agentSkills/type';
import type { ClientSession } from '../../common/mongo';
import { uploadSkillPackage, deleteSkillAllPackages } from './storage';
import { removeImageByPath } from '../../common/file/image/controller';
import { createVersion } from './version/controller';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { getLogger, LogCategories } from '../../common/logger';
import { deleteSkillRelatedSandboxes } from './sandboxController';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.CREATION);

// Types for service operations
type CreateSkillData = {
  parentId?: string | null;
  name: string;
  description: string;
  author: string;
  category: string[];
  config: Record<string, any>;
  avatar?: string;
  teamId: string;
  tmbId: string;
};

// UpdateSkillData excludes markdown to ensure consistency with version management
// markdown updates must go through version workflow to keep package.zip in sync
type UpdateSkillData = Partial<
  Pick<CreateSkillData, 'name' | 'description' | 'category' | 'config' | 'avatar'>
>;

// ==================== CRUD Operations ====================

/**
 * Create a new skill
 */
export async function createSkill(data: CreateSkillData, session?: ClientSession): Promise<string> {
  const skill = new MongoAgentSkills({
    ...data,
    parentId: data.parentId || null,
    type: AgentSkillTypeEnum.skill,
    source: AgentSkillSourceEnum.personal,
    currentVersion: 0,
    versionCount: 0,
    updateTime: new Date()
  });
  await skill.save({ session });
  return skill._id.toString();
}

/**
 * Update an existing skill
 *
 * Note: This function does NOT update markdown field.
 * To update skill content (markdown), use version management workflow:
 * - Create a new version with updated markdown
 * - Generate and upload new package.zip
 * - Update currentVersion and currentStorage accordingly
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
 * Update currentStorage for a skill
 */
export async function updateCurrentStorage(
  skillId: string,
  storageInfo: {
    bucket: string;
    key: string;
    size: number;
  },
  session?: ClientSession
): Promise<void> {
  await MongoAgentSkills.updateOne(
    { _id: skillId, deleteTime: null },
    { $set: { currentStorage: storageInfo, updateTime: new Date() } },
    { session }
  );
}

/**
 * Soft delete a skill or folder (only personal skills can be deleted)
 * If it's a folder, recursively deletes all children
 */
export async function deleteSkill(skillId: string, session?: ClientSession): Promise<void> {
  const skill = await MongoAgentSkills.findOne({
    _id: skillId,
    deleteTime: null
  });

  if (!skill) {
    throw new Error('Skill not found');
  }

  if (skill.source === AgentSkillSourceEnum.system) {
    throw new Error('Cannot delete system skill');
  }

  // Find all children if it's a folder
  let deleteList: AgentSkillSchemaType[];
  if (skill.type === AgentSkillTypeEnum.folder) {
    deleteList = await findSkillAndAllChildren({
      teamId: skill.teamId!.toString(),
      skillId
    });
  } else {
    deleteList = [skill];
  }

  // Batch soft delete all skill records
  await MongoAgentSkills.updateMany(
    { _id: { $in: deleteList.map((s) => s._id) } },
    { $set: { deleteTime: new Date() } },
    { session }
  );

  // Batch soft delete all version records
  await MongoAgentSkillsVersion.updateMany(
    { skillId: { $in: deleteList.map((s) => s._id) } },
    { $set: { isDeleted: true } },
    { session }
  );

  // Queue MinIO file deletion after DB changes (S3 is not transactional)
  for (const item of deleteList) {
    if (item.teamId && item.type !== AgentSkillTypeEnum.folder) {
      deleteSkillAllPackages(item.teamId.toString(), item._id);
      if (item.avatar) {
        removeImageByPath(item.avatar);
      }
    }
  }

  // Async force delete all related sandbox resources (fire-and-forget)
  const nonFolderIds = deleteList
    .filter((s) => s.type !== AgentSkillTypeEnum.folder)
    .map((s) => s._id.toString());
  if (nonFolderIds.length > 0) {
    deleteSkillRelatedSandboxes(nonFolderIds).catch((err) => {
      logger.error('[Skill] Failed to cleanup skill sandboxes', {
        skillIds: nonFolderIds,
        error: err
      });
    });
  }
}

/**
 * Get skill by ID
 */
export async function getSkillById(skillId: string): Promise<AgentSkillSchemaType | null> {
  const skill = await MongoAgentSkills.findOne({
    _id: skillId,
    deleteTime: null
  }).lean();

  return skill as AgentSkillSchemaType | null;
}

// ==================== Import/Export ====================

/**
 * Import skill from package with full workflow (transaction)
 * This function expects to be called inside mongoSessionRun
 */
export async function importSkill(
  packageData: SkillPackageType,
  teamId: string,
  tmbId: string,
  userId: string,
  zipBuffer: Buffer,
  parentId?: string | null,
  session?: ClientSession
): Promise<string> {
  const { skill } = packageData;

  // Check for duplicate name before creating
  const nameExists = await checkSkillNameExists(skill.name, teamId, parentId || null);
  if (nameExists) {
    throw new Error('Skill with this name already exists');
  }

  // Create skill record first
  const newSkill = new MongoAgentSkills({
    parentId: parentId || null,
    type: AgentSkillTypeEnum.skill,
    source: AgentSkillSourceEnum.personal,
    name: skill.name,
    description: skill.description,
    author: userId,
    category: skill.category,
    config: skill.config || {},
    avatar: skill.avatar,
    teamId,
    tmbId,
    currentVersion: 0,
    versionCount: 1, // Will have v0
    createTime: new Date(),
    updateTime: new Date()
  });
  await newSkill.save({ session });

  const newSkillId = newSkill._id.toString();

  // Upload ZIP to MinIO
  const storageInfo = await uploadSkillPackage({
    teamId,
    skillId: newSkillId,
    version: 0,
    zipBuffer
  });

  // Update skill's currentStorage field
  await updateCurrentStorage(newSkillId, storageInfo, session);

  // Create v0 version record
  await createVersion(
    {
      skillId: newSkillId,
      tmbId,
      version: 0,
      versionName: 'Initial import',
      storage: storageInfo
    },
    session
  );

  return newSkillId;
}

// ==================== Permission Checks ====================

/**
 * Check if user can modify/delete a skill
 */
export async function canModifySkill(skillId: string, tmbId: string): Promise<boolean> {
  const skill = await MongoAgentSkills.findOne({
    _id: skillId,
    deleteTime: null
  });

  if (!skill) {
    return false;
  }

  // System skills cannot be modified
  if (skill.source === AgentSkillSourceEnum.system) {
    return false;
  }

  // Only the creator can modify
  return skill.tmbId?.toString() === tmbId;
}

/**
 * Check if skill/folder name already exists in the same parent folder
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

// ==================== Folder Management ====================

/**
 * Recursively find a skill/folder and all its children
 */
export async function findSkillAndAllChildren({
  teamId,
  skillId,
  fields
}: {
  teamId: string;
  skillId: string;
  fields?: string;
}): Promise<AgentSkillSchemaType[]> {
  const find = async (id: string): Promise<AgentSkillSchemaType[]> => {
    const children = await MongoAgentSkills.find(
      {
        teamId,
        parentId: id,
        deleteTime: null
      },
      fields
    ).lean();

    let skills: AgentSkillSchemaType[] = children as AgentSkillSchemaType[];

    for (const child of children) {
      const grandChildren = await find(child._id);
      skills = skills.concat(grandChildren);
    }

    return skills;
  };

  const [skill, childSkills] = await Promise.all([
    MongoAgentSkills.findById(skillId, fields).lean(),
    find(skillId)
  ]);

  if (!skill) {
    throw new Error('Skill not found');
  }

  return [skill as AgentSkillSchemaType, ...childSkills];
}

/**
 * Create a skill folder
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

  // Check name uniqueness in the same parent folder
  const nameExists = await checkSkillNameExists(name, teamId, parentId || null);
  if (nameExists) {
    throw new Error('Folder name already exists in this directory');
  }

  const folder = new MongoAgentSkills({
    type: AgentSkillTypeEnum.folder,
    source: AgentSkillSourceEnum.personal,
    parentId: parentId || null,
    name,
    description: description || '',
    author: '',
    category: [],
    config: {},
    teamId,
    tmbId,
    currentVersion: 0,
    versionCount: 0,
    createTime: new Date(),
    updateTime: new Date()
  });

  await folder.save({ session });
  return folder.toObject() as AgentSkillSchemaType;
}

/**
 * Get folder path from a skill/folder to root
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

  const targetId = type === 'current' ? skillId : skill.parentId ?? null;
  return await getParents(targetId);
}

/**
 * Recursively get parent folders
 */
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
 * Update parent folders' updateTime recursively (fire-and-forget)
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
