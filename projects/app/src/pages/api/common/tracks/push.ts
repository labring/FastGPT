import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';
import { TrackModel } from '@fastgpt/service/common/middle/tracks/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import z from 'zod';

export type pushQuery = {};

const pushBodySchema = z.object({
  event: z.enum(TrackEnum),
  data: z.any()
});

export type pushResponse = {};

async function handler(req: ApiRequestProps, res: ApiResponseType<any>): Promise<pushResponse> {
  if (!global.feConfigs?.isPlus) return {};

  const body = pushBodySchema.parse(req.body);
  const { teamId, tmbId, userId } = await authCert({
    req,
    authToken: true
  });

  const data = {
    teamId,
    tmbId,
    uid: userId,
    event: body.event,
    data: body.data
  };

  return TrackModel.create(data);
}

export default NextAPI(useIPFrequencyLimit({ id: 'push-tracks', seconds: 1, limit: 5 }), handler);
