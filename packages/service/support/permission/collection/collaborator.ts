import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { getChangedCollaborators } from '@fastgpt/global/support/permission/utils';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoDatasetCollection } from '../../../core/dataset/collection/schema';
import { getResourceOwnedClbs } from '../controller';
import { updateResourceCollaborators } from '../resourcePermissionService';
import type { ClientSession } from '../../../common/mongo';
import { assertDatasetCollectionPermissionEnabled } from './datasetSwitch';
import { resolveCollectionParentClbs, type CollectionMoveResourceType } from './controller';

/**
 * 配置 Collection 协作者（全量替换语义），流程对齐 dataset 版 `updateResourceCollaboratorsWithAuth`：
 * 1. 跨类型父级解析：根 collection（parentId 空）父级 = dataset 有效 clbs；
 * 2. 事务内读取自身当前快照，计算变更集，先授权再写入；
 * 3. `updateResourceCollaborators` 处理冲突翻转（继承态试图改父级协作者 → 独立态）+
 *    replaceResource + syncResourceTreePermissions（folder 递归子树）。
 *
 * 前置条件：所属 dataset 必须已启用 collection 级权限（开关是唯一入口，见 datasetSwitch.ts）：
 * 关闭态不存在 collection 快照，未启用时以 `collectionPermissionDisabled` 拒绝，由前端引导开启；
 * 本函数不隐式开启开关。
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
    // 配置是启用态下的操作：关闭态不存在 collection 快照，必须先拒绝而不是隐式开启。
    await assertDatasetCollectionPermissionEnabled({
      teamId: collection.teamId,
      datasetId: collection.datasetId,
      session
    });

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

    return { changedClbs, collaborators, updated: true };
  });
}

/**
 * 读取 Collection 的完整有效协作者快照（物化直读），供协作设置弹窗展示。
 * 鉴权由调用方（目标 collection `read` 及以上）完成。
 * 传入 `session` 时在同一事务内读取，供重训 / 同步在删除原集合前留存快照。
 */
export const getCollectionCollaborators = async ({
  teamId,
  collectionId,
  session
}: {
  teamId: string;
  collectionId: string;
  session?: ClientSession;
}): Promise<CollaboratorItemType[]> => {
  return getResourceOwnedClbs({
    resourceType: PerResourceTypeEnum.collection,
    teamId,
    resourceId: collectionId,
    session
  });
};
