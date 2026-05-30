import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getAppBasicInfoByIds } from '@fastgpt/service/core/app/controller';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetAppBasicInfoBodySchema,
  GetAppBasicInfoResponseSchema,
  type GetAppBasicInfoBodyType,
  type GetAppBasicInfoResponseType
} from '@fastgpt/global/openapi/core/app/common/api';

export type getBasicInfoQuery = Record<string, never>;

export type getBasicInfoBody = GetAppBasicInfoBodyType;

export type getBasicInfoResponse = GetAppBasicInfoResponseType;

async function handler(
  req: ApiRequestProps<getBasicInfoBody, getBasicInfoQuery>
): Promise<getBasicInfoResponse> {
  const { ids } = parseApiInput({
    req,
    bodySchema: GetAppBasicInfoBodySchema
  }).body;
  const { teamId } = await authCert({ req, authToken: true });

  const apps = await getAppBasicInfoByIds({
    teamId,
    ids
  });

  return GetAppBasicInfoResponseSchema.parse(apps);
}

export default NextAPI(handler);
