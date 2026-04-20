import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import { authFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/utils';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';
import { addSeconds } from 'date-fns';

export type PresignTempFileGetUrlParams = {
  key: string;
};

async function handler(req: ApiRequestProps<PresignTempFileGetUrlParams>): Promise<string> {
  const { key } = req.body;

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: TeamDatasetCreatePermissionVal
  });
  const planStatus = await getTeamPlanStatus({ teamId });

  await authFrequencyLimit({
    eventId: `${tmbId}-getfileurl`,
    maxAmount: planStatus.standard?.maxUploadFileCount || global.feConfigs.uploadFileMaxAmount,
    expiredTime: addSeconds(new Date(), 30) // 30s
  });

  const bucket = new S3PrivateBucket();
  const { url } = await bucket.createExternalUrl({ key, expiredHours: 1 });

  return url;
}

export default NextAPI(handler);
