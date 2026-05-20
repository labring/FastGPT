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
  const { versionId, ...versionData } = data;
  const version = new MongoAgentSkillsVersion({
    ...(versionId ? { _id: versionId } : {}),
    ...versionData,
    createdAt: new Date()
  });
  await version.save({ session });

  return version._id.toString();
}
