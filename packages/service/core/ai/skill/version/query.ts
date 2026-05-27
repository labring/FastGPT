import { MongoAgentSkillsVersion } from './schema';
import { MongoAgentSkills } from '../model/schema';
import type { AgentSkillsVersionSchemaType } from '@fastgpt/global/core/ai/skill/type';

/**
 * Get a specific version by id.
 */
export async function getVersionById(
  skillId: string,
  versionId: string
): Promise<AgentSkillsVersionSchemaType | null> {
  const versionDoc = await MongoAgentSkillsVersion.findOne({
    skillId,
    _id: versionId
  }).lean();

  return versionDoc as AgentSkillsVersionSchemaType | null;
}

/**
 * Get the current version for a skill.
 */
export async function getCurrentVersion(
  skillId: string
): Promise<AgentSkillsVersionSchemaType | null> {
  const skill = await MongoAgentSkills.findOne({ _id: skillId, deleteTime: null })
    .select('currentVersionId')
    .lean();
  if (!skill?.currentVersionId) return null;

  const version = await MongoAgentSkillsVersion.findOne({
    skillId,
    _id: skill.currentVersionId
  }).lean();

  return version as AgentSkillsVersionSchemaType | null;
}

/**
 * List all versions for a skill.
 */
export async function listVersions(
  skillId: string,
  options?: {
    sort?: 'asc' | 'desc';
  }
): Promise<AgentSkillsVersionSchemaType[]> {
  const query: Record<string, any> = { skillId };

  const sortOrder = options?.sort === 'asc' ? 1 : -1;

  const versions = await MongoAgentSkillsVersion.find(query)
    .sort({ createdAt: sortOrder, _id: sortOrder })
    .lean();

  return versions as AgentSkillsVersionSchemaType[];
}
