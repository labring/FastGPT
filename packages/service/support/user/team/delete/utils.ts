import { MongoApp } from '../../../../core/app/schema';
import { deleteAppsImmediate } from '../../../../core/app/controller';
import { addAppDeleteJob } from '../../../../core/app/delete';

export const onDelAllApp = async (teamId: string) => {
  // 正常只投递根应用；如果历史数据留下孤立子应用，则把孤立应用作为自己的根补偿投递。
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

  // 添加到删除队列
  for (const app of deleteRootApps) {
    await addAppDeleteJob({
      teamId,
      appId: String(app._id)
    });
  }
};
