import { PerResourceTypeEnum, OwnerRoleVal } from '@fastgpt/global/support/permission/constant';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import type { FilePermissionType } from '@fastgpt/global/core/dataset/apiDataset/type';
import { getResourceOwnedClbs } from '../../../support/permission/controller';
import { replaceResourceClbs } from '../../../support/permission/inheritPermission';
import { getCollaboratorId } from '@fastgpt/global/support/permission/utils';
import { getTmbIdsByUsernames } from '../../../support/user/team/utils';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoDatasetCollection } from '../collection/schema';
import type { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';

/**
 * Sync external file permissions to collection collaborators.
 *
 * Compares the permissions from the external file system with the collection's
 * current direct collaborators. If different, sets inheritPermission=false and
 * replaces the collaborators with the external ones.
 *
 * Notes:
 * - Existing owner permissions are preserved (handled by replaceResourceClbs internally).
 * - Usernames that can't be resolved to tmbId are silently skipped.
 * - For folder-type collections, only the collection itself is configured (no recursive sync).
 */
export async function syncExternalFilePermissions({
  collection,
  teamId,
  externalPermissions
}: {
  collection: Pick<DatasetCollectionSchemaType, '_id' | 'type'> & {
    inheritPermission?: boolean;
  };
  teamId: string;
  externalPermissions: FilePermissionType[];
}) {
  if (!externalPermissions || externalPermissions.length === 0) return;

  // 1. Batch resolve usernames to tmbIds
  const usernames = externalPermissions.map((p) => p.username);
  const usernameTmbIdMap = await getTmbIdsByUsernames(usernames, teamId);

  const resolvedCollaborators: CollaboratorItemType[] = [];
  for (const { username, permission } of externalPermissions) {
    const tmbId = usernameTmbIdMap.get(username);
    if (!tmbId) continue;
    resolvedCollaborators.push({ tmbId, permission });
  }

  if (resolvedCollaborators.length === 0) return;

  const oldClbs = await getResourceOwnedClbs({
    resourceType: PerResourceTypeEnum.collection,
    teamId,
    resourceId: String(collection._id)
  });

  // Compare non-owner collaborators only (owner is preserved by replaceResourceClbs)
  const oldClbMap = new Map(
    oldClbs
      .filter((clb) => clb.permission !== OwnerRoleVal)
      .map((clb) => [getCollaboratorId(clb), clb.permission])
  );
  const newClbMap = new Map(
    resolvedCollaborators.map((clb) => [getCollaboratorId(clb), clb.permission])
  );

  let isDifferent = oldClbMap.size !== newClbMap.size;
  if (!isDifferent) {
    for (const [id, perm] of newClbMap) {
      if (oldClbMap.get(id) !== perm) {
        isDifferent = true;
        break;
      }
    }
  }

  if (!isDifferent) return;

  await mongoSessionRun(async (session) => {
    await replaceResourceClbs({
      resourceType: PerResourceTypeEnum.collection,
      teamId,
      resourceId: String(collection._id),
      collaborators: resolvedCollaborators,
      session
    });

    if (collection.inheritPermission !== false) {
      await MongoDatasetCollection.updateOne(
        { _id: collection._id },
        { inheritPermission: false },
        { session }
      );
    }
  });
}
