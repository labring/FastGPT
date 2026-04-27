import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import {
  ManageRoleVal,
  NullPermissionVal,
  OwnerRoleVal,
  type PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import type { ResourcePermissionType } from '@fastgpt/global/support/permission/type';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { getResourceOwnedClbs } from './controller';
import { MongoResourcePermission } from './schema';
import type { ClientSession, Model, AnyBulkWriteOperation } from '../../common/mongo';
import { getCollaboratorId, sumPer } from '@fastgpt/global/support/permission/utils';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { pickCollaboratorIdFields } from './utils';
import { getLogger, LogCategories } from '../../common/logger';

export type SyncChildrenPermissionResourceType = {
  _id: string;
  type: string;
  teamId: string;
  parentId?: ParentIdType;
};

/**
 * sync the permission to all children folders.
 * @param resource - 当前资源对象（需包含 teamId、type 等字段）
 * @param folderTypeList - 文件夹类型列表，用于判断当前资源是否为文件夹
 * @param resourceType - 资源类型枚举（如 dataset、app 等）
 * @param resourceModel - Mongoose 资源模型，用于查询子资源
 * @param session - MongoDB 事务 session，在 inheritPermission 为 true 时必须提供
 * @param collaborators - 最新的协作者列表，将同步至所有子资源
 * @param additionalFilter - 额外的查询过滤条件（例如 collection 查询时传入 { datasetId }）
 */
export async function syncChildrenPermission({
  resource,
  folderTypeList,
  resourceType,
  resourceModel,
  session,

  collaborators: latestClbList,
  additionalFilter = {}
}: {
  resource: SyncChildrenPermissionResourceType;

  // when the resource is a folder
  folderTypeList: string[];

  resourceModel: typeof Model;
  resourceType: PerResourceTypeEnum;

  // should be provided when inheritPermission is true
  session: ClientSession;

  collaborators: CollaboratorItemType[];
  // additional filter for resource model query (e.g. { datasetId } for collections)
  additionalFilter?: Record<string, any>;
}) {
  // only folder has permission
  const isFolder = folderTypeList.includes(resource.type);
  const teamId = resource.teamId;

  // If the 'root' is not a folder, which means the 'root' has no children, no need to sync.
  if (!isFolder) return;

  // get all the resource permission of the app
  const allFolders = await resourceModel
    .find(
      {
        teamId,
        inheritPermission: true,
        type: {
          $in: folderTypeList
        },
        ...additionalFilter
      },
      '_id parentId'
    )
    .lean<SyncChildrenPermissionResourceType[]>()
    .session(session);

  const allClbs = await MongoResourcePermission.find({
    resourceType,
    teamId,
    resourceId: {
      $in: allFolders.map((folder) => folder._id)
    }
  })
    .lean()
    .session(session);

  /** ResourceMap<resourceId, resourceType> */
  const resourceMap = new Map<string, SyncChildrenPermissionResourceType>();
  /** parentChildrenMap<parentId, resourceType[]> */
  const parentChildrenMap = new Map<string, SyncChildrenPermissionResourceType[]>();

  // init the map
  allFolders.forEach((resource) => {
    resourceMap.set(resource._id, resource);
    const parentId = String(resource.parentId);
    if (!parentChildrenMap.has(parentId)) {
      parentChildrenMap.set(parentId, []);
    }
    parentChildrenMap.get(parentId)!.push(resource);
  });

  /** resourceIdPermissionMap<resourceId, CollaboratorItemType[]>
   *  save the clb virtual state, not the real state at present in the DB.
   */
  const resourceIdClbMap = new Map<string, ResourcePermissionType[]>();

  // Initialize the resourceIdPermissionMap
  for (const clb of allClbs) {
    const resourceId = clb.resourceId;
    const arr = resourceIdClbMap.get(resourceId);
    if (!arr) {
      resourceIdClbMap.set(resourceId, [clb]);
    } else {
      arr.push(clb);
    }
  }

  // BFS to get all children
  const queue = [String(resource._id)];
  const ops: AnyBulkWriteOperation<ResourcePermissionType>[] = [];
  const latestClbMap = new Map(latestClbList.map((clb) => [getCollaboratorId(clb), { ...clb }]));

  while (queue.length) {
    const parentId = String(queue.shift());
    const _children = parentChildrenMap.get(parentId) || [];
    if (_children.length === 0) continue;
    for (const child of _children) {
      // 1. get what permission I have.
      const myClbs = resourceIdClbMap.get(child._id) || [];
      const myClbsIdSet = new Set(myClbs.map((clb) => getCollaboratorId(clb)));

      // 2. Find child's own owner(s)
      const myOwnerIds = new Set(
        myClbs.filter((clb) => clb.permission === OwnerRoleVal).map((clb) => getCollaboratorId(clb))
      );

      // add or update
      for (const latestClb of latestClbList) {
        const latestClbId = getCollaboratorId(latestClb);
        // Skip if child already has owner permission for this collaborator
        if (myOwnerIds.has(latestClbId)) {
          continue;
        }
        const permission =
          latestClb.permission === OwnerRoleVal ? ManageRoleVal : latestClb.permission;
        if (!myClbsIdSet.has(latestClbId)) {
          ops.push({
            insertOne: {
              document: {
                resourceId: child._id,
                resourceType,
                teamId,
                permission,
                ...pickCollaboratorIdFields(latestClb)
              } as ResourcePermissionType
            }
          });
        } else {
          ops.push({
            updateOne: {
              filter: {
                resourceId: child._id,
                teamId,
                ...pickCollaboratorIdFields(latestClb),
                resourceType
              },
              update: {
                $set: { permission }
              }
            }
          });
        }
      }

      // delete
      for (const myClb of myClbs) {
        // Skip child's own owner permission
        if (myClb.permission === OwnerRoleVal) {
          continue;
        }
        if (!latestClbMap.get(getCollaboratorId(myClb))) {
          ops.push({
            deleteOne: {
              filter: {
                resourceId: child._id,
                teamId,
                ...pickCollaboratorIdFields(myClb),
                resourceType
              }
            }
          });
        }
      }
      queue.push(child._id);
    }
  }
  await MongoResourcePermission.bulkWrite(ops, { session });
  return;
}

/**  Resume the inherit permission of the resource.
  1. Folder: Sync parent's defaultPermission and clbs, and sync its children.
  2. Resource: Sync parent's defaultPermission, and delete all its clbs.
*/
export async function resumeInheritPermission({
  resource,
  folderTypeList,
  resourceType,
  resourceModel,
  session,
  parentClbs
}: {
  resource: SyncChildrenPermissionResourceType;
  folderTypeList: string[];
  resourceType: PerResourceTypeEnum;
  resourceModel: typeof Model;
  session?: ClientSession;
  parentClbs?: CollaboratorItemType[];
}) {
  const logger = getLogger(LogCategories.MODULE.PERMISSION.INHERIT);
  const isFolder = folderTypeList.includes(resource.type);

  // Non-folder: delete all own clbs and set inheritPermission: true
  if (!isFolder) {
    const fn = async (session: ClientSession) => {
      await MongoResourcePermission.deleteMany(
        {
          resourceId: resource._id,
          resourceType,
          teamId: resource.teamId,
          permission: { $ne: OwnerRoleVal }
        },
        { session }
      );
      await resourceModel.updateOne(
        {
          _id: resource._id
        },
        {
          inheritPermission: true
        },
        { session }
      );
    };
    if (session) {
      return fn(session);
    } else {
      return mongoSessionRun(fn);
    }
  }

  // Folder resource, need to sync children
  const _parentClbs = parentClbs
    ? parentClbs
    : await getResourceOwnedClbs({
        resourceId: resource.parentId,
        teamId: resource.teamId,
        resourceType
      });

  const collaborators = _parentClbs.map((clb) => {
    if (clb.permission === OwnerRoleVal) {
      return { ...clb, permission: ManageRoleVal };
    }
    return { ...clb };
  });

  const fn = async (session: ClientSession) => {
    // sync self (replace with parent clbs, not merge)
    await replaceResourceClbs({
      resourceType,
      collaborators,
      teamId: resource.teamId,
      resourceId: resource._id,
      session
    });
    // sync children
    await syncChildrenPermission({
      resource,
      resourceModel,
      folderTypeList,
      resourceType,
      session,
      collaborators
    });

    await resourceModel.updateOne(
      {
        _id: resource._id
      },
      {
        inheritPermission: true
      },
      { session }
    );
  };

  if (session) {
    return fn(session);
  } else {
    return mongoSessionRun(fn);
  }
}

/**
 * sync parent collaborators to children.
 */
export async function syncCollaborators({
  resourceType,
  teamId,
  resourceId,
  collaborators,
  session
}: {
  resourceType: PerResourceTypeEnum;
  teamId: string;
  resourceId: string;
  collaborators: CollaboratorItemType[];
  session: ClientSession;
}) {
  // should change parent owner permission into manage
  collaborators.forEach((clb) => {
    if (clb.permission === OwnerRoleVal) {
      clb.permission = ManageRoleVal;
    }
  });
  const parentClbMap = new Map(collaborators.map((clb) => [getCollaboratorId(clb), clb]));
  const clbsNow = await MongoResourcePermission.find({
    resourceType,
    teamId,
    resourceId
  })
    .lean()
    .session(session);
  const ops: AnyBulkWriteOperation<ResourcePermissionType>[] = [];
  for (const clb of clbsNow) {
    const parentClb = parentClbMap.get(getCollaboratorId(clb));
    const permission = sumPer(parentClb?.permission ?? NullPermissionVal, clb.permission);
    ops.push({
      updateOne: {
        filter: {
          teamId,
          resourceId,
          resourceType,
          ...pickCollaboratorIdFields(clb)
        },
        update: {
          $set: { permission }
        }
      }
    });
  }

  const parentHasAndIHaveNot = collaborators.filter(
    (clb) => !clbsNow.some((myClb) => getCollaboratorId(clb) === getCollaboratorId(myClb))
  );

  for (const clb of parentHasAndIHaveNot) {
    ops.push({
      insertOne: {
        document: {
          teamId,
          resourceId,
          resourceType,
          ...pickCollaboratorIdFields(clb),
          permission: clb.permission
        } as ResourcePermissionType
      }
    });
  }

  await MongoResourcePermission.bulkWrite(ops, { session });
}

/**
 * Replace resource clbs with the given collaborators using a single bulkWrite.
 * Uses incremental updates: update existing, insert new, delete removed.
 * Owner permission is converted to manage. Remain self owner.
 */
export async function replaceResourceClbs({
  resourceType,
  teamId,
  resourceId,
  collaborators,
  session
}: {
  resourceType: PerResourceTypeEnum;
  teamId: string;
  resourceId: string;
  collaborators: CollaboratorItemType[];
  session: ClientSession;
}) {
  const clbsNow = await MongoResourcePermission.find({
    resourceType,
    teamId,
    resourceId
  })
    .lean()
    .session(session);

  // Normalize incoming collaborators: owner -> manage
  const normalizedCollaborators = collaborators.map((clb) =>
    clb.permission === OwnerRoleVal ? { ...clb, permission: ManageRoleVal } : clb
  );
  const latestClbMap = new Map(normalizedCollaborators.map((clb) => [getCollaboratorId(clb), clb]));
  const nowClbMap = new Map(clbsNow.map((clb) => [getCollaboratorId(clb), clb]));

  // Find existing owners (should not be modified or deleted)
  const ownerIds = new Set(
    clbsNow.filter((clb) => clb.permission === OwnerRoleVal).map((clb) => getCollaboratorId(clb))
  );

  const ops: AnyBulkWriteOperation<ResourcePermissionType>[] = [];

  // Update existing or insert new
  for (const [id, latestClb] of latestClbMap) {
    // Skip if existing clb is owner
    if (ownerIds.has(id)) {
      continue;
    }
    const nowClb = nowClbMap.get(id);
    if (!nowClb) {
      // Insert new
      ops.push({
        insertOne: {
          document: {
            resourceType,
            teamId,
            resourceId,
            ...pickCollaboratorIdFields(latestClb),
            permission: latestClb.permission
          } as ResourcePermissionType
        }
      });
    } else if (nowClb.permission !== latestClb.permission) {
      // Update permission if changed
      ops.push({
        updateOne: {
          filter: {
            resourceType,
            teamId,
            resourceId,
            ...pickCollaboratorIdFields(latestClb)
          },
          update: {
            $set: { permission: latestClb.permission }
          }
        }
      });
    }
  }

  // Delete removed clbs
  for (const [id, nowClb] of nowClbMap) {
    // Skip existing owner
    if (ownerIds.has(id)) {
      continue;
    }
    if (!latestClbMap.has(id)) {
      ops.push({
        deleteOne: {
          filter: {
            resourceType,
            teamId,
            resourceId,
            ...pickCollaboratorIdFields(nowClb)
          }
        }
      });
    }
  }

  if (ops.length > 0) {
    await MongoResourcePermission.bulkWrite(ops, { session });
  }
}
