import { authUserNotVisitor } from '@fastgpt/service/support/permission/auth/user';
import { NextApiRequest, NextApiResponse } from 'next';
import { MongoAppQGuide } from '@fastgpt/service/core/app/qGuideSchema';
import axios from 'axios';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { textList = [], appId, customURL } = req.body;

  if (!customURL) {
    const { teamId } = await authUserNotVisitor({ req, authToken: true });

    const currentQGuide = await MongoAppQGuide.find({ appId, teamId });
    const currentTexts = currentQGuide.map((item) => item.text);
    const textsToDelete = currentTexts.filter((text) => !textList.includes(text));

    await MongoAppQGuide.deleteMany({ text: { $in: textsToDelete }, appId, teamId });

    const newTexts = textList.filter((text: string) => !currentTexts.includes(text));

    const newDocuments = newTexts.map((text: string) => ({
      text: text,
      appId: appId,
      teamId: teamId
    }));

    await MongoAppQGuide.insertMany(newDocuments);
  } else {
    try {
      const response = await axios.post(customURL, {
        textList,
        appId
      });
      res.status(200).json(response.data);
    } catch (error) {
      res.status(500).json({ error });
    }
  }
}

export default NextAPI(handler);
