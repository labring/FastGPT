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
  ancestorId?: ParentIdType;
  parentId?: ParentIdType;
  inheritPermission: boolean;
};

// sync the permission to all children folder
// Only folder save the permission.
export async function syncPermission({
  resource,
  folderTypeList,
  permissionType,
  resourceModel
}: {
  resource: resourceType;

  // when the resource is a folder
  folderTypeList: string[];

  resourceModel: typeof Model;
  permissionType: PerResourceTypeEnum;
}) {
  // only folder has permission
  const isFolder = folderTypeList.includes(resource.type);

  if (!isFolder) {
    return;
  }

  // get all folders and the resource permission of the app
  mongoSessionRun(async (session) => {
    const [allFolders, rp] = await Promise.all([
      resourceModel.find(
        {
          teamId: resource.teamId,
          type: { $in: folderTypeList },
          inheritPermission: true,
          ancestorId: resource.ancestorId
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
    await resourceModel.updateMany(
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
  });

  if (!isFolder) {
    // app. Collaborator on it is unnessary anymore. delete them.
    await MongoResourcePermission.deleteMany({ appId: resource._id });
  }

  syncPermission({
    resource,
    resourceModel,
    folderTypeList,
    permissionType
  });
}

// usage:
// resumeInheritPermission({
//  //...
//  updatePermissionCallback: (parent, rp) => {
//    // update the permission whatever you like
//  }
//  //...
//  });
export async function removeInheritPermission({
  resource,
  resourceModel,
  updatePermissionCallback,
  permissionType
}: {
  resourceModel: typeof Model;
  resource: resourceType;
  updatePermissionCallback: (parent: typeof resource, rp: ResourcePermissionType[]) => void;
  permissionType: PerResourceTypeEnum;
}) {
  resource.inheritPermission = false;
  const [parent, rp] = await Promise.all([
    resourceModel.findById(resource._id).lean(),
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
    resourceModel,
    folderTypeList: [],
    permissionType
  });
}
