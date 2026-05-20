import { MongoAgentSkillsVersion } from './schema';
import type { ClientSession } from '../../../../common/mongo';

/**
 * Soft delete a version.
 * Active versions cannot be deleted: deactivate or switch to another version first.
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

  // Refuse to delete the currently active version to prevent data orphaning.
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
 * The restored version is set back to isDeleted=false but remains inactive.
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
