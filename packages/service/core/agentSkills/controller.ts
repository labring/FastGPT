import { MongoAgentSkills } from './schema';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/agentSkills/constants';
import type {
  AgentSkillSchemaType,
  AgentSkillListItemType,
  SkillPackageType
} from '@fastgpt/global/core/agentSkills/type';
import type { ClientSession } from '../../common/mongo';
import { uploadSkillPackage } from './storage';
import { createVersion } from './versionController';

// Types for service operations
type CreateSkillData = {
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

type ListSkillsParams = {
  source?: 'store' | 'mine';
  teamId?: string;
  searchKey?: string;
  category?: string;
  page: number;
  pageSize: number;
};

// ==================== CRUD Operations ====================

/**
 * Create a new skill
 */
export async function createSkill(data: CreateSkillData, session?: ClientSession): Promise<string> {
  const skill = new MongoAgentSkills({
    ...data,
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
 * Soft delete a skill (only personal skills can be deleted)
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

  await MongoAgentSkills.updateOne(
    { _id: skillId },
    { $set: { deleteTime: new Date() } },
    { session }
  );
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

// ==================== List Operations ====================

/**
 * List skills with pagination and filtering
 */
export async function listSkills(
  params: ListSkillsParams
): Promise<{ list: AgentSkillListItemType[]; total: number }> {
  const { source, teamId, searchKey, category, page, pageSize } = params;

  // Build query
  const query: Record<string, any> = {
    deleteTime: null
  };

  // Source filter
  if (source === 'store') {
    query.source = AgentSkillSourceEnum.system;
  } else if (source === 'mine' && teamId) {
    query.source = AgentSkillSourceEnum.personal;
    query.teamId = teamId;
  }

  // Category filter — use $in because category is an array field
  if (category) {
    query.category = { $in: [category] };
  }

  // Search key (text search on name and description)
  if (searchKey) {
    query.$or = [
      { name: { $regex: searchKey, $options: 'i' } },
      { description: { $regex: searchKey, $options: 'i' } }
    ];
  }

  // Execute query with pagination
  const skip = (page - 1) * pageSize;

  const [skills, total] = await Promise.all([
    MongoAgentSkills.find(query)
      .select('_id source name description author category avatar createTime updateTime')
      .sort({ createTime: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    MongoAgentSkills.countDocuments(query)
  ]);

  return {
    list: skills as AgentSkillListItemType[],
    total
  };
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
  session?: ClientSession
): Promise<string> {
  const { skill } = packageData;

  // Create skill record first
  const newSkill = new MongoAgentSkills({
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
 * Check if skill name already exists for a team
 */
export async function checkSkillNameExists(
  name: string,
  teamId: string,
  excludeId?: string
): Promise<boolean> {
  const query: Record<string, any> = {
    name,
    teamId,
    deleteTime: null
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const count = await MongoAgentSkills.countDocuments(query);
  return count > 0;
}
