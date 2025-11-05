import { NextAPI } from '@/service/middleware/entry';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { AppSchema } from '@fastgpt/global/core/app/type';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import type { ResourcePermissionType } from '@fastgpt/global/support/permission/type';
import type { AnyBulkWriteOperation } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { type NextApiRequest, type NextApiResponse } from 'next';

async function appSplitMigration() {
  const allTeamIds = await MongoTeam.find({}, '_id').lean();
  for await (const teamId of allTeamIds) {
    const allApps = await MongoApp.find({ teamId }).lean();
    // 1. judge if migration:
    // do not mirgation:
    //     a. do not have folder type apps
    //     b. have any resourceFolder type app
    if (
      allApps.every((app) => app.type !== AppTypeEnum.folder) &&
      allApps.some((app) => app.type === AppTypeEnum.resourceFolder)
    ) {
      continue; // skip this team
    }

    const rps = await MongoResourcePermission.find({
      teamId,
      resourceType: PerResourceTypeEnum.app
    }).lean();

    const appMap = new Map<string, { parentId?: ParentIdType; newId?: string }>(
      allApps.map((app) => [app._id, { parentId: app.parentId, newId: undefined }])
    );

    const RPMap = new Map<string, ResourcePermissionType>(rps.map((rp) => [rp.resourceId, rp]));

    const allFolders = allApps.filter((item) => item.type === AppTypeEnum.folder);
    const allResources = allApps.filter((item) =>
      [
        AppTypeEnum.httpPlugin,
        AppTypeEnum.httpToolSet,
        AppTypeEnum.plugin,
        AppTypeEnum.tool,
        AppTypeEnum.toolSet
      ].includes(item.type)
    );

    await mongoSessionRun(async (session) => {
      // 2. create new folders
      const newFolders = await MongoApp.create(
        allFolders.map((folder) => ({
          ...folder,
          teamId,
          type: AppTypeEnum.resourceFolder,
          _id: undefined
        })),
        {
          session,
          ordered: true
        }
      );

      for (let index = 0; index < newFolders.length; index++) {
        appMap.set(allFolders[index]._id, {
          ...appMap.get(allFolders[index]._id),
          newId: newFolders[index]._id
        });
      }

      // update parentIds
      // update rps
      {
        const ops: AnyBulkWriteOperation<AppSchema>[] = [];
        const rpOps: AnyBulkWriteOperation<ResourcePermissionType>[] = [];

        for (const folder of allFolders) {
          const obj = appMap.get(folder._id)!;

          const oldRp = RPMap.get(folder._id)!;
          rpOps.push({
            insertOne: {
              document: {
                ...oldRp,
                resourceId: obj.newId!,
                _id: undefined
              }
            }
          });

          if (!obj.parentId) continue;
          ops.push({
            updateOne: {
              filter: {
                _id: obj.newId,
                teamId
              },
              update: {
                parentId: obj.parentId
              }
            }
          });
        }

        for (const app of allResources) {
          const obj = appMap.get(app._id);
          const newParentId = obj?.parentId ? appMap.get(obj!.parentId)?.newId : null;
          if (!newParentId) {
            continue;
          }

          ops.push({
            updateOne: {
              filter: {
                _id: app._id
                // teamId
              },
              update: {
                parentId: newParentId
              }
            }
          });
        }

        console.log(JSON.stringify(ops, null, 2));
        console.log(JSON.stringify(rpOps, null, 2));
        await MongoApp.bulkWrite(ops, { session });
        await MongoResourcePermission.bulkWrite(rpOps, { session });
      }
    });
  }
}

async function handler(req: NextApiRequest, _res: NextApiResponse) {
  await authCert({ req, authRoot: true });
  await appSplitMigration();
}

export default NextAPI(handler);
