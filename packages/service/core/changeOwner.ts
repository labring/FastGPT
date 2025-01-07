// import { ClientSession } from '@/service/common/mongo';
// import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
// import { findAppAndAllChildren } from '@fastgpt/service/core/app/controller';
// import { MongoApp } from '@fastgpt/service/core/app/schema';
// import { findDatasetAndAllChildren } from '@fastgpt/service/core/dataset/controller';
// import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
// import { MongoOpenApi } from '@fastgpt/service/support/openapi/schema';
// import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
// import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';

import { mongoSessionRun } from '../common/mongo/sessionRun';
import { ClientSession } from 'mongoose';
import { MongoOpenApi } from '../support/openapi/schema';
import { MongoOutLink } from '../support/outLink/schema';
import { MongoResourcePermission } from '../support/permission/schema';
import { findAppAndAllChildren } from './app/controller';
import { MongoApp } from './app/schema';
import { findDatasetAndAllChildren } from './dataset/controller';
import { MongoDataset } from './dataset/schema';

type changeOwnerParams = {
  changeOwnerType: 'app' | 'dataset';
  resourceId?: string;
  newOwnerId: string;
  oldOwnerId: string;
  teamId: string;
  session?: ClientSession;
};

/** change owner of a list of resources
 * this function will change the owner of a list of resources.
 * If it is not a folder, only the resource itself will be changed.
 * If it is a folder, the resource and all its children will be changed.
 * OwnerId of the resource and the collaborators table (resource_permission) will be changed.
 *
 * @param changeOwnerType 'app' | 'dataset'
 * @param newOwnerId new owner id
 * @param oldOwnerId old owner id
 * @param teamId team id
 * @param resourceId resource id (optional): when it is not passed, it will change all the resources' owner in the team
 */
export async function changeOwner({
  changeOwnerType,
  newOwnerId,
  oldOwnerId,
  teamId,
  resourceId,
  session
}: changeOwnerParams) {
  const func = async (session: ClientSession) => {
    // get the Model and all the resourceIdList
    // Model: MongoApp | MongoDataset
    // resourceIdList: string[]
    const [Model, resourceList] = await (async () => {
      switch (changeOwnerType) {
        case 'app':
          return [
            MongoApp,
            resourceId
              ? await findAppAndAllChildren({ teamId, appId: resourceId })
              : await MongoApp.find({ teamId }).lean()
          ];
        case 'dataset':
          return [
            MongoDataset,
            resourceId
              ? await findDatasetAndAllChildren({ teamId, datasetId: resourceId })
              : await MongoDataset.find({ teamId }).lean()
          ];
      }
    })();

    if (!Model) {
      return;
    }

    // 1. update resources' owner
    if (resourceId) {
      await Model.updateOne(
        {
          _id: resourceId
        },
        {
          tmbId: newOwnerId,
          inheritPermission: false
        },
        {
          session
        }
      );
    }

    // 2. Update other resources' owner
    await Model.updateMany(
      {
        _id: { $in: resourceList.filter((id) => String(id) !== String(resourceId)) },
        teamId,
        tmbId: oldOwnerId
      },
      {
        tmbId: newOwnerId
      },
      {
        session
      }
    );

    // If is app, update outlinks' owner
    if (changeOwnerType === 'app') {
      await MongoOutLink.updateMany(
        {
          teamId,
          tmbId: oldOwnerId,
          appId: { $in: resourceList.map((item) => item._id) }
        },
        {
          tmbId: newOwnerId
        },
        { session }
      );
      await MongoOpenApi.updateMany(
        {
          teamId,
          tmbId: oldOwnerId,
          appId: { $in: resourceList.map((item) => item._id) }
        },
        { tmbId: newOwnerId },
        { session }
      );
    }

    /* Update permission 
      1. 有 oldOwner 有 newOwner 的 permission，取最大值（删除所有 newOwner 的per,然后把 newOwner 的 tmbId 和 per 都更新）
      2. 有 oldOwner 没有 newOwner， 把 oldOwner 更新为 newOwner
      3. 有 newOwner， 没有 oldOwner, 不变
    */
    const clbs = await MongoResourcePermission.find({
      resourceType: changeOwnerType,
      teamId,
      resourceId: { $in: resourceList },
      tmbId: {
        $in: [oldOwnerId, newOwnerId]
      }
    }).lean();

    const oldOwnerClbs = clbs.filter((clb) => String(clb.tmbId) === String(oldOwnerId));
    const newOwnerClbs = clbs.filter((clb) => String(clb.tmbId) === String(newOwnerId));

    const deletePerIdList: string[] = [];
    const updatePerList: { id: string; per: number }[] = [];
    oldOwnerClbs.forEach((oldClb) => {
      const newOwner = newOwnerClbs.find(
        (item) => String(item.resourceId) === String(oldClb.resourceId)
      );

      if (newOwner) {
        const maxPer = Math.max(oldClb.permission, newOwner.permission);
        deletePerIdList.push(String(newOwner._id));
        updatePerList.push({
          id: String(oldClb._id),
          per: maxPer
        });
      } else {
        updatePerList.push({
          id: String(oldClb._id),
          per: oldClb.permission
        });
      }
    });

    // Delete the oldOwner's permission
    await MongoResourcePermission.deleteMany({ _id: { $in: deletePerIdList } }, { session });

    // Update permission
    for await (const item of updatePerList) {
      await MongoResourcePermission.updateOne(
        {
          _id: item.id
        },
        {
          tmbId: newOwnerId,
          permission: item.per
        },
        {
          session
        }
      );
    }
  };

  if (session) {
    await func(session);
  } else {
    await mongoSessionRun(func);
  }
}
