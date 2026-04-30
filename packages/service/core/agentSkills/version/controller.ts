/**
 * Skill Version Controller
 *
 * Provides CRUD operations for skill version management.
 */

import { MongoAgentSkillsVersion } from './schema';
import type { ClientSession } from '../../../common/mongo';
import type { AgentSkillsVersionSchemaType } from '@fastgpt/global/core/agentSkills/type';

export type CreateVersionData = {
  skillId: string;
  tmbId: string;
  version: number;
  versionName?: string;
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
  const version = new MongoAgentSkillsVersion({
    ...data,
    isActive: true,
    isDeleted: false,
    createdAt: new Date()
  });
  await version.save({ session });

  return version._id.toString();
}

/**
 * Get the next version number for a skill.
 * Should be called inside a transaction session to avoid version number races.
 */
export async function getNextVersionNumber(
  skillId: string,
  session?: ClientSession
): Promise<number> {
  const lastVersion = await MongoAgentSkillsVersion.findOne(
    { skillId, isDeleted: false },
    { version: 1 },
    { sort: { version: -1 }, session }
  ).lean();

  return (lastVersion?.version ?? -1) + 1;
}

/**
 * Get a specific version by skillId and version number
 */
export async function getVersionBySkillIdAndVersion(
  skillId: string,
  version: number
): Promise<AgentSkillsVersionSchemaType | null> {
  const versionDoc = await MongoAgentSkillsVersion.findOne({
    skillId,
    version,
    isDeleted: false
  }).lean();

  return versionDoc as AgentSkillsVersionSchemaType | null;
}

/**
 * Get the active version for a skill
 */
export async function getActiveVersion(
  skillId: string
): Promise<AgentSkillsVersionSchemaType | null> {
  const version = await MongoAgentSkillsVersion.findOne({
    skillId,
    isActive: true,
    isDeleted: false
  }).lean();

  return version as AgentSkillsVersionSchemaType | null;
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
): Promise<AgentSkillsVersionSchemaType[]> {
  const query: Record<string, any> = { skillId };

  if (!options?.includeDeleted) {
    query.isDeleted = false;
  }

  const sortOrder = options?.sort === 'asc' ? 1 : -1;

  const versions = await MongoAgentSkillsVersion.find(query).sort({ version: sortOrder }).lean();

  return versions as AgentSkillsVersionSchemaType[];
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
  await MongoAgentSkillsVersion.updateMany(
    { skillId, isDeleted: false },
    { $set: { isActive: false } },
    { session }
  );

  // Then, activate the specified version
  const result = await MongoAgentSkillsVersion.updateOne(
    { skillId, version, isDeleted: false },
    { $set: { isActive: true } },
    { session }
  );

  if (result.matchedCount === 0) {
    throw new Error(`Version ${version} not found for skill ${skillId}`);
  }
}

/**
 * Soft delete a version.
 * Active versions cannot be deleted — deactivate or switch to another version first.
 */
export async function deleteVersion(
  skillId: string,
  version: number,
  session?: ClientSession
): Promise<void> {
  const versionDoc = await MongoAgentSkillsVersion.findOne({
    skillId,
    version,
    isDeleted: false
  });

  if (!versionDoc) {
    throw new Error(`Version ${version} not found for skill ${skillId}`);
  }

  // Refuse to delete the currently active version to prevent data orphaning
  if (versionDoc.isActive) {
    throw new Error(
      `Cannot delete active version ${version}. Switch to another version before deleting.`
    );
  }

  await MongoAgentSkillsVersion.updateOne(
    { skillId, version },
    { $set: { isDeleted: true } },
    { session }
  );
}

/**
 * Restore a deleted version.
 * The restored version is set back to isDeleted=false but remains inactive (isActive=false).
 * Call setActiveVersion explicitly if you want to make it the active version.
 */
export async function restoreVersion(
  skillId: string,
  version: number,
  session?: ClientSession
): Promise<void> {
  const versionDoc = await MongoAgentSkillsVersion.findOne({
    skillId,
    version,
    isDeleted: true
  });

  if (!versionDoc) {
    throw new Error(`Deleted version ${version} not found for skill ${skillId}`);
  }

  await MongoAgentSkillsVersion.updateOne(
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
  }>,
  session?: ClientSession
): Promise<void> {
  const result = await MongoAgentSkillsVersion.updateOne(
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

  return MongoAgentSkillsVersion.countDocuments(query);
}
