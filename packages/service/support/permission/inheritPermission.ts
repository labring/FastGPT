import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { MongoResourcePermission } from './schema';
import { ClientSession, Model } from 'mongoose';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import {
  PermissionValueType,
  ResourcePermissionType
} from '@fastgpt/global/support/permission/type';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';

type ResourceType = {
  _id: string;
  type: string;
  teamId: string;
  defaultPermission: PermissionValueType;
  parentId?: ParentIdType;
  inheritPermission: boolean;
};

// sync the permission to all children folders.
export async function syncChildrenPermission({
  resource,
  folderTypeList,
  resourceType,
  resourceModel,
  session,
  collaborators
}: {
  resource: ResourceType;

  // when the resource is a folder
  folderTypeList: string[];

  resourceModel: typeof Model;
  resourceType: PerResourceTypeEnum;

  // should be provided when inheritPermission is true
  session?: ClientSession;
  collaborators: ResourcePermissionType[];
}) {
  // only folder has permission
  const isFolder = folderTypeList.includes(resource.type);

  if (!isFolder) {
    return;
  }

  // get all folders and the resource permission of the app
  const fn = async (session: ClientSession) => {
    const allFolders = await resourceModel
      .find(
        {
          teamId: resource.teamId,
          type: { $in: folderTypeList },
          inheritPermission: true
        },
        '_id parentId'
      )
      .lean();

    // bfs to get all children
    const queue = [String(resource._id)];
    const children: string[] = [];

    while (queue.length) {
      const parentId = queue.shift();
      const folderChildren = allFolders.filter(
        (folder) => String(folder.parentId) === String(parentId)
      );
      children.push(...folderChildren.map((folder) => folder._id));
      queue.push(...folderChildren.map((folder) => folder._id));
    }

    if (!children.length) {
      return;
    }

    for (const childId of children) {
      await resourceModel.findByIdAndUpdate(
        childId,
        {
          defaultPermission: resource.defaultPermission
        },
        { session }
      );
    }

    // sync the resource permission
    if (!collaborators.length) {
      return;
    }

    for (const childId of children) {
      updateCollaborators({
        resourceType,
        session,
        collaborators,
        teamId: resource.teamId,
        resourceId: childId
      });
    }
  };
  if (session) {
    await fn(session);
  } else {
    await mongoSessionRun(fn);
  }
}

// resume the inherit permission of the resource.
export async function resumeInheritPermission({
  resource,
  folderTypeList,
  resourceType,
  resourceModel,
  session,
  parentResource
}: {
  resource: ResourceType;
  folderTypeList: string[];
  resourceType: PerResourceTypeEnum;
  resourceModel: typeof Model;
  parentResource: ResourceType;
  session?: ClientSession;
}) {
  const isFolder = folderTypeList.includes(resource.type);

  if (!resource.parentId) {
    // it is a root folder. which does not have a parent.
    return Promise.reject(CommonErrEnum.inheritPermissionError);
  }

  const fn = async (session: ClientSession) => {
    // const parent = await resourceModel.findById(resource.parentId).lean().session(session);
    await resourceModel.updateOne(
      {
        _id: resource._id
      },
      {
        inheritPermission: true,
        defaultPermission: parentResource.defaultPermission // it is ok even it is a app, as we will not use it anyway.
      },
      { session }
    );

    resource.inheritPermission = true;
    resource.defaultPermission = parentResource.defaultPermission;

    const collaborators = await (async () => {
      if (!isFolder) {
        // if it is not a folder, delete all the collaborators
        await MongoResourcePermission.deleteMany({ resourceId: resource._id }, { session });
        return [];
      } else {
        const collaborators = await getParentCollaborators({
          resource,
          resourceType,
          session
        });

        // update myself
        await updateCollaborators({
          resourceType,
          session,
          collaborators: collaborators,
          teamId: resource.teamId,
          resourceId: resource._id
        });

        return collaborators;
      }
    })();

    await syncChildrenPermission({
      resource,
      resourceModel,
      folderTypeList,
      resourceType,
      session,
      collaborators
    });
  };

  if (session) {
    fn(session);
  } else {
    mongoSessionRun(fn);
  }
}

// get the parent collaborators of the resource.
// @param resource: the resource to get the parent collaborators.
// @param resourceType: the type of the resource in ResourcePermission Table.
export async function getParentCollaborators({
  resource,
  resourceType,
  session
}: {
  resource: ResourceType;
  resourceType: PerResourceTypeEnum;
  session?: ClientSession;
}) {
  return await MongoResourcePermission.find(
    {
      resourceId: resource.parentId,
      resourceType: resourceType,
      teamId: resource.teamId
    },
    null,
    {
      session
    }
  ).lean();
}

// delete all the collaborators and then insert the new collaborators.
export async function updateCollaborators({
  resourceType,
  session,
  teamId,
  resourceId,
  collaborators
}: {
  resourceType: PerResourceTypeEnum;
  session: ClientSession;
  teamId: string;
  resourceId: string;
  collaborators: ResourcePermissionType[];
}) {
  await MongoResourcePermission.deleteMany(
    {
      teamId,
      resourceId,
      resourceType
    },
    { session }
  );
  // then write in
  for (const item of collaborators) {
    await MongoResourcePermission.updateOne(
      {
        teamId: teamId,
        resourceId,
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
