import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

type Props = {
  versionId: string;
  appId: string;
};

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { versionId, appId } = req.query as Props;

  await authApp({ req, authToken: true, appId, per: ReadPermissionVal });
  const result = await MongoAppVersion.findById(versionId);

  return result;
}

export default NextAPI(handler);
