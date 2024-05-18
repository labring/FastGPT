import type { NextApiRequest, NextApiResponse } from 'next';
import { MongoAppQGuide } from '@fastgpt/service/core/app/qGuideSchema';
import axios from 'axios';
import { PaginationProps } from '@fastgpt/web/common/fetch/type';
import { NextAPI } from '@/service/middleware/entry';

type Props = PaginationProps<{
  appId: string;
  customURL: string;
  searchKey: string;
}>;

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { appId, customURL, current, pageSize, searchKey } = req.query as unknown as Props;

  if (!customURL) {
    const [result, total] = await Promise.all([
      MongoAppQGuide.find({
        appId,
        ...(searchKey && { text: { $regex: new RegExp(searchKey, 'i') } })
      })
        .sort({
          time: -1
        })
        .skip((current - 1) * pageSize)
        .limit(pageSize),
      MongoAppQGuide.countDocuments({ appId })
    ]);

    return {
      list: result.map((item) => item.text) || [],
      total
    };
  } else {
    try {
      const response = await axios.get(customURL as string, {
        params: {
          appid: appId
        }
      });
      res.status(200).json(response.data);
    } catch (error) {
      res.status(500).json({ error });
    }
  }
}

export default NextAPI(handler);
