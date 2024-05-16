import type { NextApiRequest, NextApiResponse } from 'next';
import { authUserRole } from '@fastgpt/service/support/permission/auth/user';
import { NextAPI } from '@/service/middle/entry';
import { MongoAppQGuide } from '@fastgpt/service/core/app/qGuideSchema';
import axios from 'axios';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { appId, customURL } = req.query;
  if (!customURL) {
    const { teamId } = await authUserRole({ req, authToken: true });

    const questionGuideText = await MongoAppQGuide.findOne({ appId, teamId });

    return questionGuideText?.text || [];
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
