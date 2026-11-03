import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetModerationRecordsBodySchema,
  type GetModerationRecordsBodyType,
  type GetModerationRecordsResponseType
} from '@fastgpt/global/openapi/core/plugin/admin/moderation/api';
import { findModerationRecords } from '@fastgpt/service/core/plugin/moderation/service';

export type AdminModerationRecordsQuery = Record<string, never>;
export type AdminModerationRecordsBody = GetModerationRecordsBodyType;
export type AdminModerationRecordsResponse = GetModerationRecordsResponseType;

/**
 * 分页查询系统内容审查持久化审计记录。
 * 需要系统管理员权限。
 */
export async function handler(
  req: ApiRequestProps<AdminModerationRecordsBody, AdminModerationRecordsQuery>,
  _res: ApiResponseType<any>
): Promise<AdminModerationRecordsResponse> {
  await authSystemAdmin({ req });

  const { body } = parseApiInput({
    req,
    bodySchema: GetModerationRecordsBodySchema
  });

  return findModerationRecords({
    stage: body.stage,
    verdict: body.verdict,
    offset: body.offset,
    limit: body.limit
  });
}

export default NextAPI(handler);
