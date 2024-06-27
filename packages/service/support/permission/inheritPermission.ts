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

// sync the permission to all children folder
// Only folder save the permission.
export async function syncPermission({
  resource,
  folderTypeList,
  permissionType,
  resourceModel,
  parentResource
}: {
  resource: resourceType;

  // when the resource is a folder
  folderTypeList: string[];

  resourceModel: typeof Model;
  permissionType: PerResourceTypeEnum;

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
      resourceType: permissionType
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
          resourceType: permissionType
        },
        { session }
      );
      // then write in
      for (const item of rp) {
        await MongoResourcePermission.updateOne(
          {
            teamId: resource.teamId,
            resourceId: childId,
            resourceType: permissionType,
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

export async function resumeInheritPermission({
  resource,
  folderTypeList,
  permissionType,
  resourceModel
}: {
  resource: resourceType;
  folderTypeList: string[];
  permissionType: PerResourceTypeEnum;
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
      permissionType,
      parentResource: parent
    });
  });
}

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
