import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { MongoResourcePermission } from './schema';
import { Model } from 'mongoose';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import {
  PermissionValueType,
  ResourcePermissionType
} from '@fastgpt/global/support/permission/type';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';

type resourceType = {
  _id: string;
  type: string;
  teamId: string;
  defaultPermission: PermissionValueType;
  parentId?: ParentIdType;
  inheritPermission: boolean;
};

// sync the permission to all children folders, or sync from parent folder.
// hint: Only folder save the permission.
// @param resource: the resource (as the root of the tree). The children of it will be synced.
// @param folderTypeList: the type of folder. To determine if the resource is a folder.
// @param resourceType: the type of the resource in ResourcePermission Table.
// @param parentResource(optional): the parent resource of the resource.
//  If the [parentResource] is provided, the permission of the resource will be synced from the parent.
//  Otherwise, the permission of the resource will be synced to all children folders.
// @example:
// await syncPermission({
//  resource: app,
//  folderTypeList: AppFolderTypeList,
//  resourceType: PerResourceTypeEnum.App,
//  resourceModel: AppModel
//});
export async function syncPermission({
  resource,
  folderTypeList,
  resourceType,
  resourceModel,
  parentResource
}: {
  resource: resourceType;

  // when the resource is a folder
  folderTypeList: string[];

  resourceModel: typeof Model;
  resourceType: PerResourceTypeEnum;

  // should be provided when inheritPermission is true
  parentResource?: resourceType;
}) {
  // only folder has permission
  const isFolder = folderTypeList.includes(resource.type);
  const isInherit = parentResource !== undefined;

  if (!isFolder && !parentResource) {
    return;
  }

  // get all folders and the resource permission of the app
  mongoSessionRun(async (session) => {
    const allFolders = await resourceModel
      .find(
        {
          teamId: resource.teamId,
          type: { $in: folderTypeList },
          inheritPermission: true
        },
        null
      )
      .lean();
    const resourceId = isInherit ? resource.parentId : resource._id;
    const rp = await MongoResourcePermission.find({
      teamId: resource.teamId,
      resourceId, // get from parent if inherit is true
      resourceType: resourceType
    }).lean();

    // bfs to get all children
    const queue = [resource._id.toString()];
    const children: string[] = [];

    while (queue.length) {
      const parentId = queue.shift();
      const folderChildren = allFolders.filter(
        (folder) => String(folder.parentId) === String(parentId)
      );
      children.push(...folderChildren.map((folder) => folder._id));
      queue.push(...folderChildren.map((folder) => folder._id));
    }

    if (isInherit) {
      children.push(resource._id); // push the resource itself
    }
    if (!children.length) {
      return;
    }

    for (const childId of children) {
      await resourceModel.updateOne(
        {
          _id: childId
        },
        {
          defaultPermission: isInherit
            ? parentResource!.defaultPermission
            : resource.defaultPermission
        },
        { session }
      );
    }

    // sync the resource permission
    if (!rp.length) {
      return;
    }

    for (const childId of children) {
      await MongoResourcePermission.deleteMany(
        {
          teamId: resource.teamId,
          resourceId: childId,
          resourceType: resourceType
        },
        { session }
      );
      // then write in
      for (const item of rp) {
        await MongoResourcePermission.updateOne(
          {
            teamId: resource.teamId,
            resourceId: childId,
            resourceType: resourceType,
            tmbId: item.tmbId
          },
          {
            permission: item.permission
          },
          { session, upsert: true }
        );
      }
    }
  });
}

// resume the inherit permission of the resource.
// @param resource: the resource to resume the inherit permission.
// @param folderTypeList: the type of folder. To determine if the resource is a folder.
// @param resourceType: the type of the resource in ResourcePermission Table.
// @param resourceModel: the model of the resource.
// @example:
// await resumeInheritPermission({
//   resource: app,
//   folderTypeList: AppFolderTypeList,
//   resourceType: PerResourceTypeEnum.App,
//   resourceModel: AppModel
// });
export async function resumeInheritPermission({
  resource,
  folderTypeList,
  resourceType,
  resourceModel
}: {
  resource: resourceType;
  folderTypeList: string[];
  resourceType: PerResourceTypeEnum;
  resourceModel: typeof Model;
}) {
  const isFolder = folderTypeList.includes(resource.type);

  if (!resource.parentId) {
    // it is a root folder. which does not have a parent.
    return Promise.reject(CommonErrEnum.inheritPermissionError);
  }

  mongoSessionRun(async (session) => {
    const parent = await resourceModel.findById(resource.parentId).lean().session(session);

    resource.inheritPermission = true;
    resource.defaultPermission = parent.defaultPermission;

    // update the app's defaultPermission and inheritPermission itself
    await resourceModel.updateOne(
      {
        _id: resource._id
      },
      {
        inheritPermission: true,
        defaultPermission: parent.defaultPermission // it is ok even it is a app, as we will not use it anyway.
      },
      { session }
    );
    if (!isFolder) {
      // app. Collaborator on it is unnessary anymore. delete them.
      await MongoResourcePermission.deleteMany({ resourceId: resource._id }, { session });
    }

    await syncPermission({
      resource,
      resourceModel,
      folderTypeList,
      resourceType: resourceType,
      parentResource: parent
    });
  });
}

// get the parent collaborators of the resource.
// @param resource: the resource to get the parent collaborators.
// @param resourceType: the type of the resource in ResourcePermission Table.
export async function getParentCollaborators({
  resource,
  resourceType
}: {
  resource: resourceType;
  resourceType: PerResourceTypeEnum;
}): Promise<ResourcePermissionType[]> {
  return await MongoResourcePermission.find({
    resourceId: resource.parentId,
    resourceType: resourceType,
    teamId: resource.teamId
  }).lean();
}
