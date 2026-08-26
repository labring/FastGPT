import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { findModelData } from '@fastgpt/service/core/ai/model';
import { desensitizeSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  AdminSystemModelReferenceSchema,
  GetAdminSystemModelDetailResponseSchema,
  type AdminSystemModelReference,
  type GetAdminSystemModelDetailResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';

export type detailQuery = AdminSystemModelReference;

export type detailBody = Record<string, never>;

export type detailResponse = GetAdminSystemModelDetailResponse;

async function handler(req: ApiRequestProps<detailBody, detailQuery>): Promise<detailResponse> {
  await authSystemAdmin({ req });

  const reference = parseApiInput({ req, querySchema: AdminSystemModelReferenceSchema }).query;
  const modelItem = findModelData(reference);
  if (!modelItem) {
    return Promise.reject(ModelErrEnum.unExist);
  }
  return GetAdminSystemModelDetailResponseSchema.parse(desensitizeSystemModel(modelItem));
}

export default NextAPI(handler);
