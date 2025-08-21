import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { NullRoleVal, type PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import type { ResourcePermissionType } from '@fastgpt/global/support/permission/type';
import type { ClientSession, Model } from 'mongoose';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { getResourceClbs } from './controller';
import { MongoResourcePermission } from './schema';
import type { AnyBulkWriteOperation } from 'common/mongo';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';

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

  collaborators?: CollaboratorItemType[];
}) {
  // only folder has permission
  const isFolder = folderTypeList.includes(resource.type);
  const teamId = resource.teamId;

  // If the 'root' is not a folder, which means the 'root' has no children, no need to sync.
  if (!isFolder) return;

  // get all the resource permission of the app
  const allResources = await resourceModel
    .find(
      {
        teamId,
        inheritPermission: true
      },
      '_id parentId'
    )
    .lean<SyncChildrenPermissionResourceType[]>()
    .session(session);

  const allClbs = await MongoResourcePermission.find({
    resourceType,
    teamId
  })
    .lean()
    .session(session);

  const resourceMap = new Map<string, SyncChildrenPermissionResourceType>();
  const parentChildrenMap = new Map<string, SyncChildrenPermissionResourceType[]>();
  const resourceIdPermissionMap = new Map<string, ResourcePermissionType[]>();

  // init the map
  allResources.forEach((resource) => {
    resourceMap.set(resource._id, resource);
    const parentId = String(resource.parentId);
    if (!parentChildrenMap.has(parentId)) {
      parentChildrenMap.set(parentId, []);
    }
    parentChildrenMap.get(parentId)!.push(resource);
  });

  allClbs.forEach((clb) => {
    const resourceId = String(clb.resourceId);
    if (!resourceIdPermissionMap.has(resourceId)) {
      resourceIdPermissionMap.set(resourceId, []);
    }
    resourceIdPermissionMap.get(resourceId)!.push(clb);
  });

  // BFS to get all children
  const queue = [String(resource._id)];
  const children: string[] = [];
  const visited = new Set<string>();

  while (queue.length) {
    const parentId = String(queue.shift()!);
    if (visited.has(parentId)) continue;
    visited.add(parentId);
    const _children = parentChildrenMap.get(parentId) || [];
    children.push(..._children.map((child) => child._id));
    queue.push(..._children.map((child) => child._id));
  }
  if (!children.length) return;

  const ops: AnyBulkWriteOperation<ResourcePermissionType>[] = [];

  // sync the resource permission
  if (collaborators) {
    // Update the collaborators of all children
    for await (const childId of children) {
      const childResource = resourceMap.get(childId)!;
      const parentResource = childResource.parentId
        ? resourceMap.get(String(childResource.parentId))
        : undefined;
      const childClbs = resourceIdPermissionMap.get(childId) || [];
      const parentClbs = parentResource
        ? resourceIdPermissionMap.get(String(parentResource._id)) || []
        : [];

      if (parentResource) {
        for (const parentClb of parentClbs) {
          const childClb = childClbs.find(
            (clb) =>
              String(clb.tmbId) === String(parentClb.tmbId) ||
              String(clb.groupId) === String(parentClb.groupId) ||
              String(clb.orgId) === String(parentClb.orgId)
          );
          if (childClb) {
            // child has the same collaborator, add the permission on it.
            ops.push({
              updateOne: {
                filter: {
                  resourceId: childId,
                  resourceType,
                  teamId
                },
                update: {
                  permission: sumPer(parentClb.permission, childClb.permission),
                  selfPermission: childClb.permission // save the raw permission
                }
              }
            });
          } else {
            // child has no collaborator, add the permission on it.
            ops.push({
              updateOne: {
                filter: {
                  resourceId: childId,
                  resourceType,
                  teamId
                },
                update: {
                  permission: parentClb.permission,
                  selfPermission: NullRoleVal // the raw permission is 0
                }
              }
            });
          }
        }
        // only children need to be updated
        // await syncCollaborators({
        //   resourceType,
        //   session,
        //   collaborators,
        //   teamId: resource.teamId,
        //   resourceId: childId
        // });
      }
    }
  }

  await MongoResourcePermission.bulkWrite(ops, { session });
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
    if (isFolder) {
      const parentClbsAndGroups = await getResourceClbs({
        resourceId: resource.parentId,
        teamId: resource.teamId,
        resourceType,
        session
      });

      // sync self
      await syncCollaborators({
        resourceType,
        collaborators: parentClbsAndGroups,
        teamId: resource.teamId,
        resourceId: resource._id,
        session
      });
      // sync children
      await syncChildrenPermission({
        resource: {
          ...resource
        },
        resourceModel,
        folderTypeList,
        resourceType,
        session,
        collaborators: parentClbsAndGroups
      });
    } else {
      // Not folder, delete all clb
      await MongoResourcePermission.deleteMany({ resourceId: resource._id }, { session });
    }
  };

  if (session) {
    return fn(session);
  } else {
    return mongoSessionRun(fn);
  }
}

/**
  Delete all the collaborators and then insert the new collaborators.
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
  await MongoResourcePermission.deleteMany(
    {
      resourceType,
      teamId,
      resourceId
    },
    { session }
  );
  await MongoResourcePermission.insertMany(
    collaborators.map((item) => ({
      teamId: teamId,
      resourceId,
      resourceType: resourceType,
      tmbId: item.tmbId,
      groupId: item.groupId,
      orgId: item.orgId,
      permission: item.permission
    })),
    {
      session,
      ordered: true
    }
  );
}
