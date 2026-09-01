import { MongoApp } from '../../../../core/app/schema';
import { deleteAppsImmediate } from '../../../../core/app/controller';
import { addAppDeleteJobs } from '../../../../core/app/delete';

export const onDelAllApp = async (teamId: string) => {
  // Normally only roots are submitted; orphaned children become compensating roots.
  const apps = await MongoApp.find(
    {
      teamId
    },
    '_id parentId'
  );
  const appIdSet = new Set(apps.map((app) => String(app._id)));
  const deleteRootApps = apps.filter((app) => !app.parentId || !appIdSet.has(String(app.parentId)));
  const appIds = apps.map((app) => app._id);

  // Stop background tasks immediately
  await deleteAppsImmediate({
    teamId,
    appIds: appIds
  });

  // 标记所有应用为待删除
  await MongoApp.updateMany(
    {
      teamId
    },
    {
      $set: {
        deleteTime: new Date()
      }
    }
  );

  // Add all root task Flows atomically in bounded batches.
  await addAppDeleteJobs(
    deleteRootApps.map((app) => ({
      teamId,
      appId: String(app._id)
    }))
  );
};
