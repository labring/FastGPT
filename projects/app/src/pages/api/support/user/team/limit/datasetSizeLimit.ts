import type { ApiRequestProps } from '@fastgpt/next/type';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  DatasetSizeLimitQuerySchema,
  DatasetSizeLimitResponseSchema,
  type DatasetSizeLimitResponse
} from '@fastgpt/global/openapi/support/user/team/limit/api';

async function handler(req: ApiRequestProps): Promise<DatasetSizeLimitResponse> {
  const { size } = parseApiInput({
    req,
    querySchema: DatasetSizeLimitQuerySchema
  }).query;

  // 凭证校验
  const { teamId } = await authCert({ req, authToken: true });

  if (size === undefined) {
    return DatasetSizeLimitResponseSchema.parse(undefined);
  }

  await checkDatasetIndexLimit({
    teamId,
    insertLen: size
  });

  return DatasetSizeLimitResponseSchema.parse(undefined);
}

export default NextAPI(handler);
