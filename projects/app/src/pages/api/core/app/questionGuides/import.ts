import { NextAPI } from '@/service/middle/entry';
import { authUserNotVisitor } from '@fastgpt/service/support/permission/auth/user';
import { NextApiRequest, NextApiResponse } from 'next';
import { MongoAppQGuide } from '@fastgpt/service/core/app/qGuideSchema';
import axios from 'axios';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { text = [], appId, customURL } = req.body;

  if (!customURL) {
    const { teamId } = await authUserNotVisitor({ req, authToken: true });

    const qGuide = await MongoAppQGuide.find({ appId, teamId });
    if (qGuide.length > 0) {
      await MongoAppQGuide.updateOne({ appId, teamId }, { text });
    } else {
      await MongoAppQGuide.create({
        text,
        appId,
        teamId
      });
    }
  } else {
    try {
      const response = await axios.post(customURL, {
        text,
        appId
      });
      res.status(200).json(response.data);
    } catch (error) {
      res.status(500).json({ error });
    }
  }
}

export default NextAPI(handler);
