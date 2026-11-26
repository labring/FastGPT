import { restoreModerationConfigs } from './moderation/entity';
import { MongoSystemTool } from './tool/systemToolSchema';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import type { ClientSession } from '../../common/mongo';

/** Restore local soft-uninstall markers only for packages whose remote installation succeeded. */
export const restoreLocalPluginConfigs = async ({
  pluginIds,
  session
}: {
  pluginIds: string[];
  session?: ClientSession;
}) => {
  if (pluginIds.length === 0) return;
  const escapedIds = pluginIds.map((id) =>
    `systemTool-${id}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  await restoreModerationConfigs({ pluginIds, session });
  await MongoSystemTool.updateMany(
    {
      status: PluginStatusEnum.Offline,
      $or: escapedIds.map((id) => ({ pluginId: { $regex: `^${id}(?:/|$)` } }))
    },
    { $set: { status: PluginStatusEnum.Normal } },
    { session }
  );
};
