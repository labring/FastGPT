import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { addLog } from '@fastgpt/service/common/system/log';
import type { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';
import { TrackModel } from '@fastgpt/service/common/middle/tracks/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';

export type pushQuery = {};

export type pushBody = {
  event: TrackEnum;
  data: any;
};

export type pushResponse = {};

async function handler(
  req: ApiRequestProps<pushBody, pushQuery>,
  res: ApiResponseType<any>
): Promise<pushResponse> {
  if (!global.feConfigs?.isPlus) return {};

  const { teamId, tmbId, userId } = await authCert({
    req,
    authToken: true
  });

  const data = {
    teamId,
    tmbId,
    uid: userId,
    event: req.body.event,
    data: req.body.data
  };

  addLog.info('Push tracks', data);
  return TrackModel.create(data);
}

export default NextAPI(useIPFrequencyLimit({ id: 'push-tracks', seconds: 1, limit: 5 }), handler);
