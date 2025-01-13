import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { VersionListItemType } from '@fastgpt/global/core/app/version';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';

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

      const memberList = await MongoTeamMember.find(
        {
          _id: { $in: versions.map((item) => item.tmbId) }
        },
        '_id name avatar status'
      ).lean();

      return versions.map((item) => {
        const member = memberList.find((member) => String(member._id) === String(item.tmbId));
        return {
          ...item,
          sourceMember: {
            name: member?.name || '',
            avatar: member?.avatar || '',
            status: member?.status || ''
          }
        };
      });
    })(),
    MongoAppVersion.countDocuments({ appId })
  ]);

  const versionList = result.map((item) => {
    return {
      _id: item._id,
      appId: item.appId,
      versionName: item.versionName,
      time: item.time,
      isPublish: item.isPublish,
      tmbId: item.tmbId,
      sourceMember: item.sourceMember
    };
  });

  return {
    total,
    list: versionList
  };
}

export default NextAPI(handler);
