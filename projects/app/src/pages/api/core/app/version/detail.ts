import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { AppVersionSchemaType } from '@fastgpt/global/core/app/version';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';

type Props = {
  versionId: string;
  appId: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<any>
): Promise<AppVersionSchemaType> {
  const { versionId, appId } = req.query as Props;

  await authApp({ req, authToken: true, appId, per: WritePermissionVal });
  const result = await MongoAppVersion.findById(versionId).lean();

  if (!result) {
    return Promise.reject('version not found');
  }

  return {
    ...result,
    versionName: result?.versionName || formatTime2YMDHM(result?.time)
  };
}

export default NextAPI(handler);
