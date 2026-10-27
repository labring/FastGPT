import type { ApiRequestProps } from '@fastgpt/next/type';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import {
  ManagePermissionVal,
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { checkMoveFolderDepth } from '@fastgpt/service/common/parentFolder/depth';
import {
  getFolderAncestorIdsFromParentId,
  rewriteFolderSubtreeAncestorIds
} from '@fastgpt/service/common/parentFolder/ancestorIds';
import { serviceEnv } from '@fastgpt/service/env';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import {
  syncChildrenPermission,
  syncCollaborators
} from '@fastgpt/service/support/permission/inheritPermission';
import { getResourceOwnedClbs } from '@fastgpt/service/support/permission/controller';
import { shouldInheritResourcePermission } from '@fastgpt/service/support/permission/resourcePermissionPolicy';
import { syncDatasetToCollections } from '@fastgpt/service/support/permission/collection/controller';
import { addAuditLog, getI18nDatasetType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

const logDatasetMove = ({
  tmbId,
  teamId,
  dataset,
  targetName
}: {
  tmbId: string;
  teamId: string;
  dataset: any;
  targetName: string;
}) => {
  addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.MOVE_DATASET,
    params: {
      datasetName: dataset.name,
      targetFolderName: targetName,
      datasetType: getI18nDatasetType(dataset.type)
    }
  });
};

/** 移动单个知识库或文件夹，处理深度、权限继承与更新时间更新。 */
export const moveDataset = async ({
  req,
  id,
  parentId: rawParentId
}: {
  req: ApiRequestProps;
  id: string;
  parentId: ParentIdType;
}) => {
  const parentId = rawParentId || null;
  const { dataset, tmbId, teamId } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId: id,
    per: ReadPermissionVal
  });

  let targetName = 'root';
  if (parentId) {
    const { dataset: targetDataset } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      datasetId: parentId,
      per: ManagePermissionVal
    });
    targetName = targetDataset.name;
  }
  if (dataset.parentId) {
    await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      datasetId: dataset.parentId,
      per: ManagePermissionVal
    });
  }
  if (parentId === null || !dataset.parentId) {
    await authUserPer({
      req,
      authToken: true,
      per: TeamDatasetCreatePermissionVal
    });
  }

  await checkMoveFolderDepth({
    resourceId: id,
    targetParentId: parentId,
    teamId: dataset.teamId,
    model: MongoDataset,
    isFolderType: (type) => type === DatasetTypeEnum.folder
  });

  await mongoSessionRun(async (session) => {
    const isPathFolder = dataset.type === DatasetTypeEnum.folder;
    const ancestorIds = isPathFolder
      ? await getFolderAncestorIdsFromParentId({
          parentId: parentId ? String(parentId) : null,
          findFolder: (parentFolderId) =>
            MongoDataset.findOne({
              _id: parentFolderId,
              teamId: dataset.teamId,
              type: DatasetTypeEnum.folder
            })
              .select('_id parentId')
              .session(session)
              .lean()
        })
      : undefined;
    const rewriteDescendantPaths = async () => {
      if (!isPathFolder || !ancestorIds) return;
      await rewriteFolderSubtreeAncestorIds({
        rootId: id,
        rootAncestorIds: ancestorIds,
        maxDepth: serviceEnv.MAX_FOLDER_DEPTH,
        findChildFolders: (parentIds) =>
          MongoDataset.find({
            teamId: dataset.teamId,
            parentId: { $in: parentIds },
            type: DatasetTypeEnum.folder
          })
            .select('_id parentId')
            .session(session)
            .lean(),
        writeAncestorIds: (updates) =>
          MongoDataset.bulkWrite(
            updates.map(({ id: folderId, ancestorIds: childAncestorIds }) => ({
              updateOne: {
                filter: { _id: folderId, teamId: dataset.teamId, type: DatasetTypeEnum.folder },
                update: { $set: { ancestorIds: childAncestorIds } }
              }
            })),
            { session }
          ).then(() => undefined)
      });
    };

    // 路径和 parentId 在同一事务写入；权限非继承分支也必须更新后代路径。
    if (!shouldInheritResourcePermission(dataset.inheritPermission)) {
      await MongoDataset.updateOne(
        { _id: id },
        {
          ...parseParentIdInMongo(parentId),
          ...(ancestorIds ? { ancestorIds } : {}),
          updateTime: new Date()
        },
        { session }
      );
      await rewriteDescendantPaths();
      return;
    }

    // 继承态，需要改内容，同时更新协作者
    const [parentClbs, oldParentClbs, oldResourceClbs] = await Promise.all([
      getResourceOwnedClbs({
        teamId: dataset.teamId,
        resourceId: parentId,
        resourceType: PerResourceTypeEnum.dataset,
        session
      }),
      dataset.parentId
        ? getResourceOwnedClbs({
            teamId: dataset.teamId,
            resourceId: dataset.parentId,
            resourceType: PerResourceTypeEnum.dataset,
            session
          })
        : Promise.resolve([]),
      getResourceOwnedClbs({
        teamId: dataset.teamId,
        resourceId: id,
        resourceType: PerResourceTypeEnum.dataset,
        session
      })
    ]);
    const newResourceClbs = await syncCollaborators({
      teamId: dataset.teamId,
      resourceId: id,
      resourceType: PerResourceTypeEnum.dataset,
      collaborators: parentClbs,
      oldParentCollaborators: oldParentClbs,
      session
    });

    // Dataset ACL 是完整有效快照。先同步 Collection，确保还能读取后代 Dataset 的旧快照。
    await syncDatasetToCollections({
      teamId: dataset.teamId,
      datasetId: String(dataset._id),
      oldEffectiveClbs: oldResourceClbs,
      newEffectiveClbs: newResourceClbs,
      session
    });

    await syncChildrenPermission({
      resource: dataset,
      resourceType: PerResourceTypeEnum.dataset,
      resourceModel: MongoDataset,
      folderTypeList: [DatasetTypeEnum.folder],
      oldParentCollaborators: oldResourceClbs,
      newParentCollaborators: newResourceClbs,
      session
    });
    await MongoDataset.updateOne(
      { _id: id },
      {
        ...parseParentIdInMongo(parentId),
        ...(ancestorIds ? { ancestorIds } : {}),
        // 移入是授权行为：移入后始终按继承态处理（与上游 dataset 权限逻辑一致）
        inheritPermission: true,
        updateTime: new Date()
      },
      { session }
    );
    await rewriteDescendantPaths();
  });

  logDatasetMove({ tmbId, teamId, dataset, targetName });
};
