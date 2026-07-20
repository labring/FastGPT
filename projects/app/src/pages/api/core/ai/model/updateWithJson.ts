import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoSystemModel } from '@fastgpt/service/core/ai/model/schema';
import { normalizeSystemModel } from '@fastgpt/service/core/ai/model/normalize';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/model/utils';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  SystemModelConfigJsonItemSchema,
  UpdateWithJsonBodySchema,
  UpdateWithJsonResponseSchema,
  type UpdateWithJsonBody,
  type UpdateWithJsonResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { Types } from '@fastgpt/service/common/mongo';
import { isObjectId } from '@fastgpt/global/common/string/utils';

async function handler(req: ApiRequestProps<UpdateWithJsonBody>): Promise<UpdateWithJsonResponse> {
  const { isRoot } = await authUserPer({
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  if (!isRoot) {
    return Promise.reject(ModelErrEnum.rootOnlyPermit);
  }

  const { config } = parseApiInput({ req, bodySchema: UpdateWithJsonBodySchema }).body;
  let data: Record<string, unknown>[];

  try {
    data = JSON.parse(config);
  } catch {
    return Promise.reject(ModelErrEnum.invalidModelConfig);
  }

  if (!Array.isArray(data) || data.length === 0) {
    return Promise.reject(ModelErrEnum.invalidModelConfig);
  }

  // Validate the complete import before opening the write transaction. The JSON
  // payload is user input nested inside a string, so Zod failures map to the
  // public model-config error instead of surfacing as internal validation bugs.
  const validatedData: Record<string, unknown>[] = [];
  for (const item of data) {
    const result = SystemModelConfigJsonItemSchema.safeParse(item);
    if (!result.success) {
      return Promise.reject(ModelErrEnum.invalidModelConfig);
    }
    const parsedItem = result.data as Record<string, unknown>;
    if (!parsedItem.model || !parsedItem.type || !parsedItem.provider) {
      return Promise.reject(ModelErrEnum.invalidModelConfig);
    }
    if (typeof parsedItem.id === 'string' && parsedItem.id && !isObjectId(parsedItem.id)) {
      return Promise.reject(ModelErrEnum.invalidModelId);
    }
    validatedData.push(parsedItem);
  }

  await mongoSessionRun(async (session) => {
    for (const item of validatedData) {
      // Partial clean: strip unknown fields without requiring every LLM field.
      const cleaned = normalizeSystemModel(item, { partial: true });

      if (item.id) {
        // Update existing model (upsert guards against stale ids). System models
        // do not maintain tmbId/teamId (design data-model §1.2) — strip them so
        // imported JSON cannot re-attach team ownership.
        const { tmbId, teamId, ...cleanWithoutOwner } = cleaned;
        await MongoSystemModel.updateOne(
          { _id: new Types.ObjectId(item.id as string) },
          { $set: { ...cleanWithoutOwner, isSystem: true, updatedAt: new Date() } },
          { upsert: true, session }
        );
      } else {
        // Create new system model. System models do not maintain tmbId/teamId
        // (design data-model §1.2); they belong to no team or individual.
        await MongoSystemModel.insertOne(
          {
            ...cleaned,
            isSystem: true,
            isActive: item.isActive ?? true,
            createdAt: new Date(),
            updatedAt: new Date()
          },
          { session }
        );
      }
    }
  });

  await updatedReloadSystemModel();

  return UpdateWithJsonResponseSchema.parse(undefined);
}

export default NextAPI(handler);
