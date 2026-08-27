import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { findModelData } from '@fastgpt/service/core/ai/model';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  AdminSystemModelReferenceSchema,
  GetAdminSystemModelDetailResponseSchema,
  type AdminSystemModelReference,
  type GetAdminSystemModelDetailResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';

async function handler(
  req: ApiRequestProps<Record<string, never>, AdminSystemModelReference>
): Promise<GetAdminSystemModelDetailResponse> {
  await authSystemAdmin({ req });

  const reference = parseApiInput({ req, querySchema: AdminSystemModelReferenceSchema }).query;
  const modelItem = findModelData(reference);
  if (!modelItem) return Promise.reject(ModelErrEnum.unExist);

  // 管理员详情用于编辑完整配置；仅列表接口脱敏，避免详情 round-trip 丢失鉴权和类型配置。
  return GetAdminSystemModelDetailResponseSchema.parse(modelItem);
}

export default NextAPI(handler);
