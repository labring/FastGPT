import { MongoAgentSkillsVersion } from './schema';
import type { ClientSession } from '../../../../common/mongo';
import type { CreateVersionData } from './types';

/**
 * Create a new skill version.
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
