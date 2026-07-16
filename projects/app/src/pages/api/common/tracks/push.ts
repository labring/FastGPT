import type { ApiRequestProps } from '@fastgpt/next/types';
import { NextAPI } from '@/service/middleware/entry';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';
import { TrackModel } from '@fastgpt/service/common/middle/tracks/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import z from 'zod';

const pushBodySchema = z.object({
  event: z.enum(TrackEnum),
  data: z.any()
});

async function handler(req: ApiRequestProps): Promise<undefined> {
  if (!global.feConfigs?.isPlus) return;

  const body = parseApiInput({ req, bodySchema: pushBodySchema }).body;
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

  await TrackModel.create(data);
}

export default NextAPI(useIPFrequencyLimit({ id: 'push-tracks', seconds: 1, limit: 5 }), handler);
