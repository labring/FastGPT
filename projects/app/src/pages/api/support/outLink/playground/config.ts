import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  GetPlaygroundVisibilityConfigParamsSchema,
  type GetPlaygroundVisibilityConfigParamsType
} from '@fastgpt/global/openapi/core/app/publishChannel/playground/api';
import {
  PlaygroundVisibilityConfigSchema,
  type PlaygroundVisibilityConfigType
} from '@fastgpt/global/support/outLink/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(
  req: ApiRequestProps<Record<string, never>, GetPlaygroundVisibilityConfigParamsType>
): Promise<PlaygroundVisibilityConfigType> {
  const { appId } = parseApiInput({
    req,
    querySchema: GetPlaygroundVisibilityConfigParamsSchema
  }).query;

  await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  const existingConfig = await MongoOutLink.findOne(
    {
      appId,
      type: PublishChannelEnum.playground
    },
    'showRunningStatus showSkillReferences showCite showFullText canDownloadSource showWholeResponse'
  ).lean();

  return PlaygroundVisibilityConfigSchema.parse({
    showRunningStatus: existingConfig?.showRunningStatus ?? true,
    showSkillReferences: existingConfig?.showSkillReferences ?? false,
    showCite: existingConfig?.showCite ?? true,
    showFullText: existingConfig?.showFullText ?? true,
    canDownloadSource: existingConfig?.canDownloadSource ?? true,
    showWholeResponse: existingConfig?.showWholeResponse ?? true
  });
}

export default NextAPI(handler);
