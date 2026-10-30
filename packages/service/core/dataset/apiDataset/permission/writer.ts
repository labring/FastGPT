import { MongoDatasetCollection } from '../../collection/schema';
import { resourcePermissionRepo } from '../../../../support/permission/repository/resourcePermissionRepo';
import { syncResourceTreePermissions } from '../../../../support/permission/resourcePermissionService';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { getPermissionSubjectKey } from './resolver';
import { assertPermissionSyncDeadline } from './utils';
import type { CollectionPermissionTargetState } from './types';

/** 协作者集合比较键：subject + role。ACL 行里存的就是这两项。 */
const collaboratorKey = (collaborator: CollaboratorItemType) =>
  `${getPermissionSubjectKey(collaborator)}:${collaborator.permission}`;

/**
 * 比较两组协作者是否等价：subject + role 相同即可，与顺序无关；重复项视为不同集合。
 * 只用于判断「要不要写库 / 要不要物化子树」，不参与授权判断。
 */
export const isSameCollaboratorSet = (a: CollaboratorItemType[], b: CollaboratorItemType[]) => {
  if (a.length !== b.length) return false;
  const keys = new Set(a.map(collaboratorKey));
  if (keys.size !== new Set(b.map(collaboratorKey)).size) return false;
  return b.every((item) => keys.has(collaboratorKey(item)));
};

/**
 * 在一个事务里写入本轮目标态，三步一起提交：要么全部生效，要么全部回滚。
 *
 * 1. 全量替换这批节点的 ACL 行；
 * 2. 把它们翻成独立态（`inheritPermission=false`），此后只认自己的 ACL；
 * 3. 对 ACL 真的变了的目录，把新 ACL 物化给仍在继承它的后代。
 *
 * 同轮内父子目录都被改时不需要按层级排序，`states` 顺序无所谓：
 * 第 2 步先把所有目标节点都翻成独立态，第 3 步的遍历只收 `inheritPermission=true`
 * 且不在 `stopResourceIds` 里的孩子，所以父目录物化到子目录就停，子目录及其后代
 * 由子目录自己那次调用按它的新 ACL 处理。父子两次物化互不重叠，先做谁结果都一样。
 *
 * `stopResourceIds` 是本轮所有拿到明确目标态的节点：它们自己已是独立态，
 * 物化子树时不能越过它们去改它们下面的节点。
 */
export const applyCollectionPermissionStates = async ({
  teamId,
  datasetId,
  states,
  deadlineAt
}: {
  teamId: string;
  datasetId: string;
  states: CollectionPermissionTargetState[];
  /** 本轮截止时间；到达后不再写库。 */
  deadlineAt?: number;
}): Promise<{ updated: number }> => {
  const changedStates = states.filter((state) => state.changed);
  if (changedStates.length === 0) return { updated: 0 };

  assertPermissionSyncDeadline(deadlineAt);

  const stopResourceIds = new Set(states.map((state) => state.collectionId));

  await mongoSessionRun(async (session) => {
    // 事务可能被 driver 重试，截止检查放在回调内才能覆盖每一次重试。
    assertPermissionSyncDeadline(deadlineAt);

    await resourcePermissionRepo.replaceResources({
      teamId,
      resourceType: PerResourceTypeEnum.collection,
      resources: changedStates.map((state) => ({
        resourceId: state.collectionId,
        collaborators: state.collaborators
      })),
      session
    });

    await MongoDatasetCollection.updateMany(
      { teamId, datasetId, _id: { $in: changedStates.map((state) => state.collectionId) } },
      { $set: { inheritPermission: false } },
      { session }
    );

    for (const state of changedStates) {
      // 只有目录的 ACL 真的变了，才需要把新 ACL 物化给需要跟随的继承态后代
      if (
        state.type !== DatasetCollectionTypeEnum.folder ||
        isSameCollaboratorSet(state.currentCollaborators, state.collaborators)
      ) {
        continue;
      }
      await syncResourceTreePermissions({
        resource: {
          _id: state.collectionId,
          type: DatasetCollectionTypeEnum.folder,
          teamId,
          parentId: state.parentId,
          inheritPermission: true
        },
        resourceModel: MongoDatasetCollection,
        resourceType: PerResourceTypeEnum.collection,
        oldParentCollaborators: state.currentCollaborators,
        newParentCollaborators: state.collaborators,
        stopResourceIds,
        session
      });
    }
  });

  return { updated: changedStates.length };
};
