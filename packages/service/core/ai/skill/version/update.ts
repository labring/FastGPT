import { MongoAgentSkillsVersion } from './schema';
import type { ClientSession } from '../../../../common/mongo';

/**
 * Update version metadata.
 */
export async function updateVersion(
  skillId: string,
  versionId: string,
  data: Partial<{
    versionName: string;
  }>,
  session?: ClientSession
): Promise<void> {
  const result = await MongoAgentSkillsVersion.updateOne(
    { _id: versionId, skillId },
    { $set: data },
    { session }
  );

  if (result.matchedCount === 0) {
    throw new Error(`Version ${versionId} not found for skill ${skillId}`);
  }
}
