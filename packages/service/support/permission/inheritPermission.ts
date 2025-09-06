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
import {
  getChangedCollaborators,
  getCollaboratorId,
  mergeCollaboratorList,
  sumPer
} from '@fastgpt/global/support/permission/utils';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { pickCollaboratorIdFields } from './utils';

export type SyncChildrenPermissionResourceType = {
  _id: string;
  type: string;
  teamId: string;
  parentId?: ParentIdType;
};

/**
 * sync the permission to all children folders.
 */
export async function syncChildrenPermission({
  resource,
  folderTypeList,
  resourceType,
  resourceModel,
  session,

  collaborators
}: {
  resource: SyncChildrenPermissionResourceType;

  // when the resource is a folder
  folderTypeList: string[];

  resourceModel: typeof Model;
  resourceType: PerResourceTypeEnum;

  // should be provided when inheritPermission is true
  session: ClientSession;

  collaborators: CollaboratorItemType[];
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
        }
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
  // 1. add `root` clbs first
  resourceIdClbMap.set(
    resource._id,
    collaborators?.map((clb) => ({
      ...clb,
      teamId: resource.teamId,
      resourceId: resource._id,
      resourceType: resourceType
    })) ?? []
  );
  // 2. add the clbs what we have now according to allClbs
  for (const clb of allClbs) {
    const resourceId = clb.resourceId;
    if (resourceId === resource._id) continue;
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
  const clbMap = new Map(collaborators.map((clb) => [getCollaboratorId(clb), { ...clb }]));

  while (queue.length) {
    const parentId = String(queue.shift());
    const _children = parentChildrenMap.get(parentId) || [];
    if (_children.length === 0) continue;
    for (const child of _children) {
      // 1. get parent's permission and what permission I have.
      const parentClbs = resourceIdClbMap.get(String(child.parentId)) || [];
      const myClbs = resourceIdClbMap.get(child._id) || [];
      const parentIdSet = new Set(parentClbs.map((clb) => getCollaboratorId(clb)));
      const myClbsIdSet = new Set(myClbs.map((clb) => getCollaboratorId(clb)));

      // add or update
      for (const clb of collaborators) {
        if (!myClbsIdSet.has(getCollaboratorId(clb))) {
          ops.push({
            insertOne: {
              document: {
                resourceId: child._id,
                resourceType,
                teamId,
                permission: parentClbs[0].permission,
                ...pickCollaboratorIdFields(clb)
              } as ResourcePermissionType
            }
          });
        } else {
          const myclb = myClbs.find((clb) => getCollaboratorId(clb) === getCollaboratorId(clb))!;
          ops.push({
            updateOne: {
              filter: {
                resourceId: child._id,
                teamId,
                ...pickCollaboratorIdFields(clb),
                resourceType
              },
              update: {
                permission: sumPer(myclb.permission, clb.permission)
              }
            }
          });
        }
      }

      // delele
      for (const myClb of myClbs) {
        if (!clbMap.get(getCollaboratorId(myClb))) {
          // the new collaborators doesnt have it. remove it
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
  session
}: {
  resource: SyncChildrenPermissionResourceType;
  folderTypeList: string[];
  resourceType: PerResourceTypeEnum;
  resourceModel: typeof Model;
  session?: ClientSession;
}) {
  const isFolder = folderTypeList.includes(resource.type);
  const fn = async (session: ClientSession) => {
    // update the resource permission
    await resourceModel.updateOne(
      {
        _id: resource._id
      },
      {
        inheritPermission: true
      },
      { session }
    );

    // Folder resource, need to sync children
    const parentClbs = await getResourceOwnedClbs({
      resourceId: resource.parentId,
      teamId: resource.teamId,
      resourceType,
      session
    });

    if (isFolder) {
      // sync self
      await syncCollaborators({
        resourceType,
        collaborators: parentClbs,
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
        collaborators: parentClbs
      });
    }
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
          permission
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
