import { MongoAgentSkillsVersion } from './schema';
import type { AgentSkillsVersionSchemaType } from '@fastgpt/global/core/ai/skill/type';

/**
 * Get a specific version by skillId and version number.
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
 * Get the active version for a skill.
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
 * List all versions for a skill.
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
 * Count versions for a skill.
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
