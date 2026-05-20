import { MongoAgentSkillsVersion } from './schema';
import type { ClientSession } from '../../../../common/mongo';

/**
 * Set a version as the active version for a skill.
 */
export async function setActiveVersion(
  skillId: string,
  version: number,
  session?: ClientSession
): Promise<void> {
  // First, deactivate all versions for this skill.
  await MongoAgentSkillsVersion.updateMany(
    { skillId, isDeleted: false },
    { $set: { isActive: false } },
    { session }
  );

  // Then, activate the specified version.
  const result = await MongoAgentSkillsVersion.updateOne(
    { skillId, version, isDeleted: false },
    { $set: { isActive: true } },
    { session }
  );

  if (result.matchedCount === 0) {
    throw new Error(`Version ${version} not found for skill ${skillId}`);
  }
}
