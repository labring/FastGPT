import { NextAPI } from '@/service/middleware/entry';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import {
  AppVersionListBodySchema,
  AppVersionListResponseSchema,
  type AppVersionListBodyType,
  type AppVersionListResponseType
} from '@fastgpt/global/openapi/core/app/version/api';

async function handler(
  req: ApiRequestProps<AppVersionListBodyType>
): Promise<AppVersionListResponseType> {
  const { appId, isPublish } = parseApiInput({
    req,
    bodySchema: AppVersionListBodySchema
  }).body;
  const { offset, pageSize } = parsePaginationRequest(req);

  await authApp({ appId, req, per: WritePermissionVal, authToken: true });

  const match = {
    appId,
    ...(isPublish !== undefined && { isPublish })
  };

  const [result, total] = await Promise.all([
    (async () => {
      const versions = await MongoAppVersion.find(match)
        .sort({
          time: -1
        })
        .skip(offset)
        .limit(pageSize)
        .lean();

      return addSourceMember({
        list: versions
      }).then((list) =>
        list.map((item) => ({
          ...item,
          isPublish: !!item.isPublish,
          versionName: item.versionName || formatTime2YMDHM(item.time)
        }))
      );
    })(),
    MongoAppVersion.countDocuments(match)
  ]);

  return AppVersionListResponseSchema.parse({
    total,
    list: result
  });
}

export default NextAPI(handler);
