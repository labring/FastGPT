import { NextAPI } from '@/service/middleware/entry';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { AppSchema } from '@fastgpt/global/core/app/type';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import type { ResourcePermissionType } from '@fastgpt/global/support/permission/type';
import type { AnyBulkWriteOperation } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { type NextApiRequest, type NextApiResponse } from 'next';

async function appSplitMigration(teamId: string) {
  const allApps = await MongoApp.find(
    { teamId },
    {
      _id: 1,
      avatar: 1,
      inheritPermission: 1,
      intro: 1,
      name: 1,
      tmbId: 1,
      teamId: 1,
      parentId: 1,
      type: 1
    }
  ).lean();

  // if there is one/or more toolFolder(s), skip this team (because the team is migrated.)
  if (allApps.some((app) => app.type === AppTypeEnum.toolFolder)) {
    return 'migrated';
  }

  const allFolders = allApps.filter((item) => item.type === AppTypeEnum.folder);

  // if there is no folders, no need to migrate.
  if (allFolders.length === 0) {
    return 'no folder';
  }

  // get all clbs
  const rps = await MongoResourcePermission.find({
    teamId,
    resourceType: PerResourceTypeEnum.app,
    resourceId: { $in: allFolders.map((app) => app._id) }
  }).lean();

  const appMap = new Map<string, { parentId?: ParentIdType; newId?: string }>(
    allApps.map((app) => [app._id, { parentId: app.parentId, newId: undefined }])
  );

  const RPMap = (() => {
    const map = new Map<string, ResourcePermissionType[]>();
    for (const rp of rps) {
      const rps = map.get(rp.resourceId);
      if (rps) {
        rps.push(rp);
      } else {
        map.set(rp.resourceId, [rp]);
      }
    }
    return map;
  })();

  const allToolTypeApps = allApps.filter((item) =>
    [
      AppTypeEnum.httpPlugin,
      AppTypeEnum.httpToolSet,
      AppTypeEnum.workflowTool,
      AppTypeEnum.tool,
      AppTypeEnum.mcpToolSet
    ].includes(item.type)
  );

  await mongoSessionRun(async (session) => {
    // 2. create new folders
    const newFolders = await MongoApp.create(
      allFolders.map((folder) => ({
        ...folder,
        teamId,
        type: AppTypeEnum.toolFolder,
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
        const newParentId = obj?.parentId ? appMap.get(obj!.parentId)?.newId : null;

        const oldRps = RPMap.get(folder._id);

        if (oldRps) {
          rpOps.push(
            ...oldRps.map((oldRp) => ({
              insertOne: {
                document: {
                  ...oldRp,
                  resourceId: obj.newId!,
                  _id: undefined
                }
              }
            }))
          );
        }

        if (!newParentId) {
          continue;
        }

        ops.push({
          updateOne: {
            filter: {
              _id: obj.newId,
              teamId
            },
            update: {
              parentId: newParentId
            }
          }
        });
      }

      for (const app of allToolTypeApps) {
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

      await MongoApp.bulkWrite(ops, { session });
      await MongoResourcePermission.bulkWrite(rpOps, { session });
    }
  });

  return 'success';
}

async function handler(req: NextApiRequest, _res: NextApiResponse) {
  await authCert({ req, authRoot: true });
  const allTeamIds = await MongoTeam.find({}, '_id').lean();
  addLog.info(`Starting app split migration, teamIds: ${allTeamIds.length}`);
  const failed = [];
  const skipedMigrated = [];
  const skipedNoFolder = [];
  const success = [];

  for await (const { _id: teamId } of allTeamIds) {
    try {
      const res = await appSplitMigration(teamId);
      if (res === 'migrated') {
        skipedMigrated.push(teamId);
      } else if (res === 'no folder') {
        skipedNoFolder.push(teamId);
      } else {
        success.push(teamId);
      }
    } catch (e) {
      addLog.error('App split script error: ', e);
      failed.push(teamId);
      continue;
    }
  }
  addLog.info(
    `\
App split migration completed!
success teams: ${success.length}, skipedMigrated: ${skipedMigrated.length}, skipedNoFolder: ${skipedNoFolder.length}
failed teams: ${failed.length}, ${failed}`
  );

  return {
    total: allTeamIds.length,
    skipedMigrated: skipedMigrated.length,
    skipedNoFolder: skipedNoFolder.length,
    success: success.length,
    failed: failed.length,
    failedTeams: failed
  };
}

export default NextAPI(handler);
