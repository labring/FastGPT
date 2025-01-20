import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { VersionListItemType } from '@fastgpt/global/core/app/version';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { addSourceMember } from '@fastgpt/service/support/user/utils';

export type versionListBody = PaginationProps<{
  appId: string;
}>;

export type versionListResponse = PaginationResponse<VersionListItemType>;

async function handler(
  req: ApiRequestProps<versionListBody>,
  _res: NextApiResponse<any>
): Promise<versionListResponse> {
  const { appId } = req.body;
  const { offset, pageSize } = parsePaginationRequest(req);

  await authApp({ appId, req, per: WritePermissionVal, authToken: true });

  const [result, total] = await Promise.all([
    (async () => {
      const versions = await MongoAppVersion.find({
        appId
      })
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
          isPublish: !!item.isPublish
        }))
      );
    })(),
    MongoAppVersion.countDocuments({ appId })
  ]);

  return {
    total,
    list: result
  };
}

export default NextAPI(handler);
