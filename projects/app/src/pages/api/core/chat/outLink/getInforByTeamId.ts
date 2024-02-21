import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { chatByTeamProps } from '@/global/core/chat/api.d';
import axios from 'axios';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { selectShareResponse } from '@/utils/service/core/chat';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    let { teamId, appId, outLinkUid } = req.query as chatByTeamProps;

    const history = await MongoChatItem.find({
      appId: appId,
      outLinkUid: outLinkUid,
      teamId: teamId
    });

    jsonRes(res, {
      data: history
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      data: req.query,
      error: err
    });
  }
}

export const config = {
  api: {
    responseLimit: '10mb'
  }
};
