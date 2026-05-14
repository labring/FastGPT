import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemTool } from '@fastgpt/service/core/plugin/tool/systemToolSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import {
  UpdateSystemToolBodySchema,
  type UpdateSystemToolBodyType
} from '@fastgpt/global/openapi/core/plugin/admin/tool/api';

export type updateToolQuery = {};

export type updateToolBody = UpdateSystemToolBodyType;

export type updateToolResponse = {};

async function handler(
  req: ApiRequestProps<updateToolBody, updateToolQuery>,
  res: ApiResponseType<any>
): Promise<updateToolResponse> {
  await authSystemAdmin({ req });
  const { id: pluginId, ...updateFields } = UpdateSystemToolBodySchema.parse(req.body);

  const plugin = await MongoSystemTool.findOne({ pluginId });

  if (plugin?.customConfig?.associatedPluginId) {
    return Promise.reject('Workflow tool should be updated through app update api');
  }

  // 基础更新字段
  const baseUpdateFields = {
    pluginId,
    status: updateFields.status,
    originCost: updateFields.originCost,
    currentCost: updateFields.currentCost,
    hasTokenFee: updateFields.hasTokenFee,
    systemKeyCost: updateFields.systemKeyCost,
    promoteTags: updateFields.promoteTags ?? null,
    hideTags: updateFields.hideTags ?? null
  };
  if ('secretsVal' in updateFields) {
    Object.assign(baseUpdateFields, {
      secretsVal: updateFields.secretsVal ?? null
    });
  }

  await mongoSessionRun(async (session) => {
    // 构建 customConfig，保留现有配置并添加/更新 tags
    const existingCustomConfig = plugin?.customConfig || {};
    const newCustomConfig = updateFields.tags
      ? { ...existingCustomConfig, tags: updateFields.tags }
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
    for await (const tool of updateFields.children || []) {
      const childPluginId = tool.id.includes('/') ? tool.id : `${pluginId}/${tool.id}`;
      const childUpdateFields = {
        pluginId: childPluginId,
        systemKeyCost: tool.systemKeyCost,
        currentCost: updateFields.currentCost,
        hasTokenFee: updateFields.hasTokenFee,
        status: updateFields.status,
        originCost: updateFields.originCost,
        promoteTags: updateFields.promoteTags,
        hideTags: updateFields.hideTags
      };
      if ('secretsVal' in updateFields) {
        Object.assign(childUpdateFields, {
          secretsVal: updateFields.secretsVal
        });
      }

      await MongoSystemTool.updateOne({ pluginId: childPluginId }, childUpdateFields, {
        upsert: true,
        session
      });
    }
  });

  return {};
}

export default NextAPI(handler);
