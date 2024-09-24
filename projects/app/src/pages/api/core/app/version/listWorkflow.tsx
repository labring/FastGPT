import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { ApiRequestProps } from '@fastgpt/service/type/next';

type Props = PaginationProps<{
  appId: string;
}>;

export type versionListResponse = {
  _id: string;
  appId: string;
  versionName: string;
  time: Date;
  isPublish: boolean | undefined;
  tmbId: string;
};

type Response = PaginationResponse<versionListResponse>;

async function handler(req: ApiRequestProps<Props>, res: NextApiResponse<any>): Promise<Response> {
  const { offset, pageSize, appId } = req.body;

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
