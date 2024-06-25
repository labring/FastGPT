import { mongoSessionRun } from 'common/mongo/sessionRun';
import { MongoResourcePermission } from './schema';
import { Model } from 'mongoose';
import {
  PermissionTypeEnum,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import {
  PermissionValueType,
  ResourcePermissionType
} from '@fastgpt/global/support/permission/type';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';

// sync the permission to all children folder
// Only folder save the permission.
export const syncPermission = async ({
  resource,
  folderTypeList,
  permissionType,
  resourceFind,
  resourceUpdateMany
}: {
  resource: {
    _id: string;
    type: string;
    teamId: string;
    defaultPermission: PermissionValueType;
  };

  // when the resource is a folder
  folderTypeList: string[];

  // example: MongoApp.find
  resourceFind: typeof Model.find;
  resourceUpdateMany: typeof Model.updateMany;
  permissionType: PermissionTypeEnum;
}) => {
  // only folder has permission
  // if (app.type !== AppTypeEnum.folder) {
  //   return;
  // }
  const isFolder = folderTypeList.includes(resource.type);

  if (!isFolder) {
    return;
  }

  // get all folders and the resource permission of the app
  mongoSessionRun(async (session) => {
    const [allFolders, rp] = await Promise.all([
      resourceFind(
        {
          teamId: resource.teamId,
          type: {},
          inheritPermission: true
        },
        null,
        { session }
      ),
      MongoResourcePermission.find(
        {
          teamId: resource.teamId,
          appId: resource._id,
          resourceType: permissionType
        },
        null,
        { session }
      )
    ]);

    // bfs
    const queue = [resource._id.toString()];
    const children: string[] = [];

    while (queue.length) {
      const parentId = queue.shift();
      const folderChildren = allFolders.filter((folder) => folder.parentId === parentId);
      children.push(...folderChildren.map((folder) => folder._id));
      queue.push(...folderChildren.map((folder) => folder._id));
    }

    // sync the defaultPermission
    await resourceUpdateMany(
      {
        _id: { $in: children }
      },
      {
        defaultPermission: resource.defaultPermission
      },
      { session }
    );

    // sync the resource permission
    return await Promise.all(
      children.map(async (childId) => {
        // delete first
        await MongoResourcePermission.deleteMany({
          teamId: resource.teamId,
          appId: childId,
          resourceType: PerResourceTypeEnum.app
        });
        // then write in
        return await MongoResourcePermission.updateMany(
          {
            teamId: resource.teamId,
            appId: childId,
            resourceType: PerResourceTypeEnum.app
          },
          {
            permission: rp[0].permission
          },
          { session, upsert: true }
        );
      })
    );
  });
};

export const resumeInheritPermission = async ({
  resource,
  folderTypeList,
  resourceFindById,
  resourceUpdateOne,
  resourceUpdateMany,
  resourceFind,
  permissionType
}: {
  resource: {
    _id: string;
    type: string;
    teamId: string;
    defaultPermission: PermissionValueType;
    parentId: ParentIdType;
    inheritPermission: boolean;
  };
  folderTypeList: string[];
  resourceFindById: typeof Model.findById;
  resourceUpdateOne: typeof Model.updateOne;
  resourceUpdateMany: typeof Model.updateMany;
  resourceFind: typeof Model.find;
  permissionType: PermissionTypeEnum;
}) => {
  const isFolder = folderTypeList.includes(resource.type);

  if (!resource.parentId) {
    // it is a root folder. which does not have a parent.
    return Promise.reject(CommonErrEnum.inheritPermissionError);
  }

  mongoSessionRun(async (session) => {
    const parent = await resourceFindById(resource.parentId).lean().session(session);

    resource.inheritPermission = true;
    resource.defaultPermission = parent.defaultPermission;

    // update the app's defaultPermission and inheritPermission itself
    await resourceUpdateOne(
      {
        _id: resource._id
      },
      {
        inheritPermission: true,
        defaultPermission: parent.defaultPermission // it is ok even it is a app, as we will not use it anyway.
      },
      { session }
    );
  });

  if (!isFolder) {
    // app. Collaborator on it is unnessary anymore. delete them.
    await MongoResourcePermission.deleteMany({ appId: resource._id });
  }

  syncPermission({
    resource,
    folderTypeList,
    permissionType,
    resourceFind,
    resourceUpdateMany
  });
};

// usage:
// resumeInheritPermission({
//  //...
//  updatePermissionCallback: (parent, rp) => {
//    // update the permission whatever you like
//  }
//  //...
//  });
export const removeInheritPermission = async ({
  resource,
  updatePermissionCallback,
  resourceFindById,
  permissionType,
  resourceFind,
  resourceUpdateMany
}: {
  resource: {
    _id: string;
    type: string;
    teamId: string;
    defaultPermission: PermissionValueType;
    parentId: ParentIdType;
    inheritPermission: boolean;
  };
  updatePermissionCallback: (parent: typeof resource, rp: ResourcePermissionType[]) => void;
  resourceFindById: typeof Model.findById;
  permissionType: PermissionTypeEnum;
  resourceFind: typeof Model.find;
  resourceUpdateMany: typeof Model.updateMany;
}) => {
  resource.inheritPermission = false;
  const [parent, rp] = await Promise.all([
    resourceFindById(resource._id).lean(),
    MongoResourcePermission.find({
      resourceId: resource.parentId,
      resourceType: permissionType,
      teamId: resource.teamId
    })
  ]);
  resource.defaultPermission = parent.defaultPermission;
  updatePermissionCallback(parent, rp);
  syncPermission({
    resource,
    folderTypeList: [],
    permissionType,
    resourceFind,
    resourceUpdateMany
  });
};
