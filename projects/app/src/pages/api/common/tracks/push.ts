import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { TrackModel } from '@fastgpt/service/common/middle/tracks/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  PushTrackBodySchema,
  type PushOutLinkBrandTrackBodyType,
  type PushTrackBodyType
} from '@fastgpt/global/openapi/common/other/api';
import { recordOutLinkBrandTrack } from '@fastgpt/service/support/outLink/branding/track';

const isOutLinkBrandTrack = (body: PushTrackBodyType): body is PushOutLinkBrandTrackBodyType =>
  'authType' in body && body.authType === 'outLink';

export async function handler(req: ApiRequestProps): Promise<undefined> {
  if (!global.feConfigs?.isPlus) return;

  const body = parseApiInput({ req, bodySchema: PushTrackBodySchema }).body;

  if (isOutLinkBrandTrack(body)) {
    await recordOutLinkBrandTrack({ req, body });
    return;
  }

  const { teamId, tmbId } = await authCert({
    req,
    authToken: true
  });

  if (body.event === TrackEnum.workflowBuilderClick) {
    pushTrack.workflowBuilderClick();
    return;
  }

  const data = {
    teamId,
    tmbId,
    event: body.event,
    data: body.data
  };

  await TrackModel.create(data);
}

export default NextAPI(handler);
