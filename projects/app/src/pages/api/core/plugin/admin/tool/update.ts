import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemTool } from '@fastgpt/service/core/plugin/tool/systemToolSchema';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import {
  UpdateSystemToolBodySchema,
  type UpdateSystemToolBodyType
} from '@fastgpt/global/openapi/core/plugin/admin/tool/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { jsonSchema2SecretInput } from '@fastgpt/global/core/app/jsonschema';
import { SystemToolCodec } from '@fastgpt/global/core/app/tool/systemTool/codec';
import { SystemToolRepo } from '@fastgpt/service/core/app/tool/systemTool/systemTool.repo';
import {
  encryptSystemToolSecrets,
  getSystemToolSecretKeys
} from '@fastgpt/service/core/app/tool/systemTool/secrets';

export type updateToolQuery = Record<string, never>;

export type updateToolBody = UpdateSystemToolBodyType;

export type updateToolResponse = Record<string, never>;

const omitUndefinedFields = <T extends Record<string, unknown>>(fields: T) =>
  Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  ) as Partial<T>;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function handler(
  req: ApiRequestProps<updateToolBody, updateToolQuery>,
  _res: ApiResponseType<any>
): Promise<updateToolResponse> {
  await authSystemAdmin({ req });
  const {
    body: { id: pluginId, ...updateFields }
  } = parseApiInput({
    req,
    bodySchema: UpdateSystemToolBodySchema
  });

  const plugin = await MongoSystemTool.findOne({ pluginId });

  if (plugin?.customConfig?.associatedPluginId) {
    return Promise.reject('Workflow tool should be updated through app update api');
  }

  const storedSecretsVal = await (async () => {
    if (!('secretsVal' in updateFields) || updateFields.secretsVal === null) {
      return updateFields.secretsVal;
    }

    const toolDetail = await SystemToolRepo.getInstance().getSystemToolDetail({
      pluginId,
      source: 'system'
    });
    const inputList = jsonSchema2SecretInput({ jsonSchema: toolDetail.secretSchema });

    return encryptSystemToolSecrets({
      secretsVal: updateFields.secretsVal,
      existingSecretsVal: SystemToolCodec.getConfiguredSecretsVal(plugin),
      secretKeys: getSystemToolSecretKeys(inputList)
    });
  })();

  // 基础更新字段
  const baseUpdateFields = omitUndefinedFields({
    pluginId,
    status: updateFields.status,
    originCost: updateFields.originCost,
    currentCost: updateFields.currentCost,
    hasTokenFee: updateFields.hasTokenFee,
    systemKeyCost: updateFields.systemKeyCost,
    promoteTags: 'promoteTags' in updateFields ? (updateFields.promoteTags ?? null) : undefined,
    hideTags: 'hideTags' in updateFields ? (updateFields.hideTags ?? null) : undefined
  });
  if ('secretsVal' in updateFields) {
    Object.assign(baseUpdateFields, {
      secretsVal: storedSecretsVal ?? null
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

    if ('secretsVal' in updateFields) {
      // 工具集的系统密钥只由父工具维护，覆盖历史子工具记录，避免子工具残留旧密钥。
      await MongoSystemTool.updateMany(
        { pluginId: { $regex: `^${escapeRegExp(pluginId)}/` } },
        { secretsVal: storedSecretsVal ?? null },
        { session }
      );
    }

    // 如果有子工具，更新子工具
    for await (const tool of updateFields.children || []) {
      const childPluginId = tool.id.includes('/') ? tool.id : `${pluginId}/${tool.id}`;
      const childUpdateFields = omitUndefinedFields({
        pluginId: childPluginId,
        systemKeyCost: tool.systemKeyCost,
        currentCost: updateFields.currentCost,
        hasTokenFee: updateFields.hasTokenFee,
        status: updateFields.status,
        originCost: updateFields.originCost,
        promoteTags: updateFields.promoteTags,
        hideTags: updateFields.hideTags
      });
      if ('secretsVal' in updateFields) {
        Object.assign(childUpdateFields, {
          secretsVal: storedSecretsVal
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
