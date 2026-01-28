import { NextAPI } from '@/service/middleware/entry';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoSystemTool } from '@fastgpt/service/core/plugin/tool/systemToolSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { refreshVersionKey } from '@fastgpt/service/common/cache';
import { SystemCacheKeyEnum } from '@fastgpt/service/common/cache/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type { UpdateToolBodyType } from '@fastgpt/global/openapi/core/plugin/admin/tool/api';

export type updateToolQuery = {};

export type updateToolBody = UpdateToolBodyType;

export type updateToolResponse = {};

async function handler(
  req: ApiRequestProps<updateToolBody, updateToolQuery>,
  res: ApiResponseType<any>
): Promise<updateToolResponse> {
  await authSystemAdmin({ req });
  const { pluginId, ...updateFields } = req.body;

  const plugin = await MongoSystemTool.findOne({ pluginId });

  // 基础更新字段
  const baseUpdateFields = {
    pluginId,
    status: updateFields.status,
    defaultInstalled: updateFields.defaultInstalled,
    originCost: updateFields.originCost,
    currentCost: updateFields.currentCost,
    hasTokenFee: updateFields.hasTokenFee,
    systemKeyCost: updateFields.systemKeyCost,
    inputListVal: updateFields.inputListVal ?? null, //Important
    promoteTags: updateFields.promoteTags ?? null,
    hideTags: updateFields.hideTags ?? null
  };

  // 如果是自定义插件,需要更新 customConfig
  if (plugin && plugin.customConfig) {
    const isUpdateVersion =
      plugin.customConfig.name !== updateFields.name ||
      plugin.customConfig.avatar !== updateFields.avatar ||
      plugin.customConfig.intro !== updateFields.intro;

    await MongoSystemTool.findOneAndUpdate(
      { pluginId },
      {
        ...baseUpdateFields,
        customConfig: {
          name: updateFields.name,
          avatar: updateFields.avatar,
          intro: updateFields.intro,
          version: isUpdateVersion ? getNanoid() : plugin.customConfig.version,
          tags: updateFields.tagIds,
          associatedPluginId: updateFields.associatedPluginId,
          userGuide: updateFields.userGuide,
          author: updateFields.author
        }
      }
    );
  } else {
    // 系统插件只更新基础字段和 tags（存储在 customConfig 中）
    await mongoSessionRun(async (session) => {
      // 构建 customConfig，保留现有配置并添加/更新 tags
      const existingCustomConfig = plugin?.customConfig || {};
      const newCustomConfig = updateFields.tagIds
        ? { ...existingCustomConfig, tags: updateFields.tagIds }
        : existingCustomConfig;

      await MongoSystemTool.updateOne(
        { pluginId },
        {
          ...baseUpdateFields,
          ...(Object.keys(newCustomConfig).length > 0 ? { customConfig: newCustomConfig } : {})
        },
        { upsert: true, session }
      );

      // 如果有子工具，更新子工具
      for await (const tool of updateFields.childTools || []) {
        await MongoSystemTool.updateOne(
          { pluginId: tool.pluginId },
          {
            pluginId: tool.pluginId,
            systemKeyCost: tool.systemKeyCost,
            inputListVal: updateFields.inputListVal
          },
          { upsert: true, session }
        );
      }
    });
  }

  await refreshVersionKey(SystemCacheKeyEnum.systemTool);

  return {};
}

export default NextAPI(handler);
