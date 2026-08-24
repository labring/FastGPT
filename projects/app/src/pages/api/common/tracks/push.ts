import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { TrackModel } from '@fastgpt/service/common/middle/tracks/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { PushTrackBodySchema } from '@fastgpt/global/openapi/common/other/api';

async function handler(req: ApiRequestProps): Promise<undefined> {
  if (!global.feConfigs?.isPlus) return;

  const body = parseApiInput({ req, bodySchema: PushTrackBodySchema }).body;
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

export default NextAPI(handler);
