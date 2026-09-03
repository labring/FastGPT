import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { getChangedCollaborators } from '@fastgpt/global/support/permission/utils';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoDatasetCollection } from '../../../core/dataset/collection/schema';
import { getResourceOwnedClbs } from '../controller';
import { updateResourceCollaborators } from '../resourcePermissionService';
import type { ClientSession } from '../../../common/mongo';
import { markDatasetCollectionPermissionsSet } from './datasetFlag';
import { resolveCollectionParentClbs, type CollectionMoveResourceType } from './controller';

/**
 * 配置 Collection 协作者（全量替换语义），流程对齐 dataset 版 `updateResourceCollaboratorsWithAuth`：
 * 1. 跨类型父级解析：根 collection（parentId 空）父级 = dataset 有效 clbs；
 * 2. 事务内读取自身当前快照，计算变更集，先授权再写入；
 * 3. `updateResourceCollaborators` 处理冲突翻转（继承态试图改父级协作者 → 独立态）+
 *    replaceResource + syncResourceTreePermissions（folder 递归子树）；
 * 4. 配置即视为"已设置 collection 权限"，置 `hasSetCollectionPermissions=true`。
 *
 * @returns 变更集与最终是否发生写入。
 */
export async function updateCollectionCollaboratorsWithAuth({
  collection,
  collaborators,
  authorize
}: {
  collection: CollectionMoveResourceType;
  /** 目标完整有效协作者列表（全量替换）。 */
  collaborators: CollaboratorItemType[];
  authorize: (changedClbs: ReturnType<typeof getChangedCollaborators>) => void | Promise<void>;
}) {
  return mongoSessionRun(async (session: ClientSession) => {
    const parentClbs = await resolveCollectionParentClbs({
      teamId: collection.teamId,
      datasetId: collection.datasetId,
      parentId: collection.parentId,
      session
    });
    const oldChildClbs = await getResourceOwnedClbs({
      resourceType: PerResourceTypeEnum.collection,
      teamId: collection.teamId,
      resourceId: String(collection._id),
      session
    });
    const changedClbs = getChangedCollaborators({
      newRealClbs: collaborators,
      oldRealClbs: oldChildClbs
    });
    await authorize(changedClbs);

    if (changedClbs.length === 0) return { changedClbs, collaborators, updated: false };

    await updateResourceCollaborators({
      newCollaborators: collaborators,
      resourceType: PerResourceTypeEnum.collection,
      resource: collection,
      resourceModel: MongoDatasetCollection,
      oldCollaborators: oldChildClbs,
      parentCollaborators: parentClbs,
      session
    });
    await markDatasetCollectionPermissionsSet({ datasetId: collection.datasetId, session });

    return { changedClbs, collaborators, updated: true };
  });
}

/**
 * 读取 Collection 的完整有效协作者快照（物化直读），供协作设置弹窗展示。
 * 鉴权由调用方（目标 collection `read` 及以上）完成。
 */
export const getCollectionCollaborators = async ({
  teamId,
  collectionId
}: {
  teamId: string;
  collectionId: string;
}): Promise<CollaboratorItemType[]> => {
  return getResourceOwnedClbs({
    resourceType: PerResourceTypeEnum.collection,
    teamId,
    resourceId: collectionId
  });
};
