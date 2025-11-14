import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getAppBasicInfoByIds } from '@fastgpt/service/core/app/controller';

export type getBasicInfoQuery = {};

export type getBasicInfoBody = {
  ids: string[];
};

export type getBasicInfoResponse = {
  id: string;
  name: string;
  avatar: string;
}[];

async function handler(
  req: ApiRequestProps<getBasicInfoBody, getBasicInfoQuery>,
  res: ApiResponseType<any>
): Promise<getBasicInfoResponse> {
  const { ids } = req.body;
  const { teamId } = await authCert({ req, authToken: true });

  const apps = await getAppBasicInfoByIds({
    teamId,
    ids
  });

  return apps;
}

export default NextAPI(handler);
