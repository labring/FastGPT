import { NextAPI } from '@/service/middleware/entry';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoSystemPlugin } from '@fastgpt/service/core/app/plugin/systemPluginSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { refreshVersionKey } from '@fastgpt/service/common/cache';
import { SystemCacheKeyEnum } from '@fastgpt/service/common/cache/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import type { UpdatePluginBodyType } from '@fastgpt/global/openapi/core/plugin/admin/api';

export type updatePluginQuery = {};

export type updatePluginBody = UpdatePluginBodyType;

export type updatePluginResponse = {};

async function handler(
  req: ApiRequestProps<updatePluginBody, updatePluginQuery>,
  res: ApiResponseType<any>
): Promise<updatePluginResponse> {
  await authSystemAdmin({ req });
  const { pluginId, ...updateFields } = req.body;

  const plugin = await MongoSystemPlugin.findOne({ pluginId });

  // 基础更新字段
  const baseUpdateFields = {
    pluginId,
    status: updateFields.status,
    defaultInstalled: updateFields.defaultInstalled,
    originCost: updateFields.originCost,
    currentCost: updateFields.currentCost,
    hasTokenFee: updateFields.hasTokenFee,
    systemKeyCost: updateFields.systemKeyCost,
    inputListVal: updateFields.inputListVal ?? null //Important
  };

  // 如果是自定义插件,需要更新 customConfig
  if (plugin && plugin.customConfig) {
    const isUpdateVersion =
      plugin.customConfig.name !== updateFields.name ||
      plugin.customConfig.avatar !== updateFields.avatar ||
      plugin.customConfig.intro !== updateFields.intro;

    await MongoSystemPlugin.findOneAndUpdate(
      { pluginId },
      {
        ...baseUpdateFields,
        customConfig: {
          name: updateFields.name,
          avatar: updateFields.avatar,
          intro: updateFields.intro,
          version: isUpdateVersion ? getNanoid() : plugin.customConfig.version,
          weight: updateFields.weight,
          workflow: updateFields.workflow,
          pluginTags: updateFields.pluginTags,
          associatedPluginId: updateFields.associatedPluginId,
          userGuide: updateFields.userGuide,
          author: updateFields.author
        }
      }
    );
  } else {
    // 系统插件只更新基础字段, 如果有 child，需要更新 child
    await mongoSessionRun(async (session) => {
      await MongoSystemPlugin.updateOne({ pluginId }, baseUpdateFields, { upsert: true, session });

      for await (const tool of updateFields.childConfigs || []) {
        await MongoSystemPlugin.updateOne(
          { pluginId: tool.pluginId },
          {
            pluginId: tool.pluginId,
            status: tool.status,
            defaultInstalled: tool.defaultInstalled,
            originCost: tool.originCost,
            currentCost: tool.currentCost,
            hasTokenFee: tool.hasTokenFee,
            systemKeyCost: tool.systemKeyCost,

            inputListVal: updateFields.inputListVal ?? null
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
