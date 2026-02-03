/**
 * Skill Version Controller
 *
 * Provides CRUD operations for skill version management.
 */

import { MongoSkillVersion } from './versionSchema';
import type { ClientSession } from '../../common/mongo';
import type { SkillVersionSchemaType } from '@fastgpt/global/core/agentSkill/type';

export type CreateVersionData = {
  skillId: string;
  tmbId: string;
  version: number;
  versionName?: string;
  markdown: string;
  config: Record<string, any>;
  description: string;
  category: string[];
  storage: {
    bucket: string;
    key: string;
    size: number;
    checksum?: string;
  };
  importSource?: {
    originalFilename: string;
    importedAt: Date;
  };
};

export type UpdateVersionData = Partial<Omit<CreateVersionData, 'skillId' | 'version'>>;

/**
 * Create a new skill version
 */
export async function createVersion(
  data: CreateVersionData,
  session?: ClientSession
): Promise<string> {
  const version = new MongoSkillVersion({
    ...data,
    isActive: true,
    isDeleted: false,
    createdAt: new Date()
  });
  await version.save({ session });

  return version._id.toString();
}

/**
 * Get the next version number for a skill
 */
export async function getNextVersionNumber(skillId: string): Promise<number> {
  const lastVersion = await MongoSkillVersion.findOne(
    { skillId, isDeleted: false },
    { version: 1 },
    { sort: { version: -1 } }
  ).lean();

  return (lastVersion?.version ?? -1) + 1;
}

/**
 * Get a specific version by skillId and version number
 */
export async function getVersionBySkillIdAndVersion(
  skillId: string,
  version: number
): Promise<SkillVersionSchemaType | null> {
  const versionDoc = await MongoSkillVersion.findOne({
    skillId,
    version,
    isDeleted: false
  }).lean();

  return versionDoc as SkillVersionSchemaType | null;
}

/**
 * Get the active version for a skill
 */
export async function getActiveVersion(skillId: string): Promise<SkillVersionSchemaType | null> {
  const version = await MongoSkillVersion.findOne({
    skillId,
    isActive: true,
    isDeleted: false
  }).lean();

  return version as SkillVersionSchemaType | null;
}

/**
 * List all versions for a skill
 */
export async function listVersions(
  skillId: string,
  options?: {
    includeDeleted?: boolean;
    sort?: 'asc' | 'desc';
  }
): Promise<SkillVersionSchemaType[]> {
  const query: Record<string, any> = { skillId };

  if (!options?.includeDeleted) {
    query.isDeleted = false;
  }

  const sortOrder = options?.sort === 'asc' ? 1 : -1;

  const versions = await MongoSkillVersion.find(query).sort({ version: sortOrder }).lean();

  return versions as SkillVersionSchemaType[];
}

/**
 * Set a version as the active version for a skill
 */
export async function setActiveVersion(
  skillId: string,
  version: number,
  session?: ClientSession
): Promise<void> {
  // First, deactivate all versions for this skill
  await MongoSkillVersion.updateMany(
    { skillId, isDeleted: false },
    { $set: { isActive: false } },
    { session }
  );

  // Then, activate the specified version
  const result = await MongoSkillVersion.updateOne(
    { skillId, version, isDeleted: false },
    { $set: { isActive: true } },
    { session }
  );

  if (result.matchedCount === 0) {
    throw new Error(`Version ${version} not found for skill ${skillId}`);
  }
}

/**
 * Soft delete a version
 */
export async function deleteVersion(
  skillId: string,
  version: number,
  session?: ClientSession
): Promise<void> {
  const versionDoc = await MongoSkillVersion.findOne({
    skillId,
    version,
    isDeleted: false
  });

  if (!versionDoc) {
    throw new Error(`Version ${version} not found for skill ${skillId}`);
  }

  // If this is the active version, we should not allow deletion
  // or we should deactivate it first
  const updateData: Record<string, any> = {
    isDeleted: true,
    isActive: false
  };

  await MongoSkillVersion.updateOne({ skillId, version }, { $set: updateData }, { session });
}

/**
 * Restore a deleted version
 */
export async function restoreVersion(
  skillId: string,
  version: number,
  session?: ClientSession
): Promise<void> {
  const versionDoc = await MongoSkillVersion.findOne({
    skillId,
    version,
    isDeleted: true
  });

  if (!versionDoc) {
    throw new Error(`Deleted version ${version} not found for skill ${skillId}`);
  }

  await MongoSkillVersion.updateOne(
    { skillId, version },
    { $set: { isDeleted: false } },
    { session }
  );
}

/**
 * Update version metadata
 */
export async function updateVersion(
  skillId: string,
  version: number,
  data: Partial<{
    versionName: string;
    markdown: string;
    config: Record<string, any>;
    description: string;
    category: string[];
  }>,
  session?: ClientSession
): Promise<void> {
  const result = await MongoSkillVersion.updateOne(
    { skillId, version, isDeleted: false },
    { $set: data },
    { session }
  );

  if (result.matchedCount === 0) {
    throw new Error(`Version ${version} not found for skill ${skillId}`);
  }
}

/**
 * Count versions for a skill
 */
export async function countVersions(
  skillId: string,
  options?: { includeDeleted?: boolean }
): Promise<number> {
  const query: Record<string, any> = { skillId };

  if (!options?.includeDeleted) {
    query.isDeleted = false;
  }

  return MongoSkillVersion.countDocuments(query);
}
