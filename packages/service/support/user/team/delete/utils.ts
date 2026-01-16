import { MongoApp } from '../../../../core/app/schema';
import { deleteAppsImmediate } from '../../../../core/app/controller';
import { addAppDeleteJob } from '../../../../core/app/delete';

export const onDelAllApp = async (teamId: string) => {
  // 取根目录所有应用
  const apps = await MongoApp.find(
    {
      teamId,
      parentId: null
    },
    '_id'
  );
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
  for (const appId of appIds) {
    await addAppDeleteJob({
      teamId,
      appId
    });
  }
};
