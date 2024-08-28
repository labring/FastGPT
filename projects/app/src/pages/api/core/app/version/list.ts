import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { AppVersionSchemaType } from '@fastgpt/global/core/app/version';

type Props = PaginationProps<{
  appId: string;
}>;

type Response = PaginationResponse<AppVersionSchemaType>;

async function handler(req: NextApiRequest, res: NextApiResponse<any>): Promise<Response> {
  const { current, pageSize, appId } = req.body as Props;

  const [result, total] = await Promise.all([
    MongoAppVersion.find({
      appId
    })
      .sort({
        time: -1
      })
      .skip((current - 1) * pageSize)
      .limit(pageSize),
    MongoAppVersion.countDocuments({ appId })
  ]);

  return {
    total,
    list: result
  };
}

export default NextAPI(handler);
