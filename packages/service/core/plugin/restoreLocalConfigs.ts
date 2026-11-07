import { restoreModerationConfigs } from './moderation/entity';
import { MongoSystemTool } from './tool/systemToolSchema';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';

/** Restore local soft-uninstall markers only for packages whose remote installation succeeded. */
export const restoreLocalPluginConfigs = async ({ pluginIds }: { pluginIds: string[] }) => {
  if (pluginIds.length === 0) return;
  const escapedIds = pluginIds.map((id) =>
    `systemTool-${id}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  await Promise.all([
    restoreModerationConfigs({ pluginIds }),
    MongoSystemTool.updateMany(
      {
        status: PluginStatusEnum.Offline,
        $or: escapedIds.map((id) => ({ pluginId: { $regex: `^${id}(?:/|$)` } }))
      },
      { $set: { status: PluginStatusEnum.Normal } }
    )
  ]);
};
