import { MongoAgentSkillsVersion } from './schema';
import type { ClientSession } from '../../../../common/mongo';

/**
 * Update version metadata.
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
