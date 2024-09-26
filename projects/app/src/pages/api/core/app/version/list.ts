import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { VersionListItemType } from '@fastgpt/global/core/app/version';

export type versionListBody = PaginationProps<{
  appId: string;
}>;

export type versionListResponse = PaginationResponse<VersionListItemType>;

async function handler(
  req: ApiRequestProps<versionListBody>,
  res: NextApiResponse<any>
): Promise<versionListResponse> {
  const { offset, pageSize, appId } = req.body;

  await authApp({ appId, req, per: WritePermissionVal, authToken: true });

  const [result, total] = await Promise.all([
    MongoAppVersion.find(
      {
        appId
      },
      '_id appId versionName time isPublish tmbId'
    )
      .sort({
        time: -1
      })
      .skip(offset)
      .limit(pageSize),
    MongoAppVersion.countDocuments({ appId })
  ]);

  const versionList = result.map((item) => {
    return {
      _id: item._id,
      appId: item.appId,
      versionName: item.versionName,
      time: item.time,
      isPublish: item.isPublish,
      tmbId: item.tmbId
    };
  });

  return {
    total,
    list: versionList
  };
}

export default NextAPI(handler);
