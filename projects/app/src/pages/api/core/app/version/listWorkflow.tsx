import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

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

async function handler(req: NextApiRequest, res: NextApiResponse<any>): Promise<Response> {
  const { current, pageSize, appId } = req.body as Props;

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
      .skip((current - 1) * pageSize)
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
