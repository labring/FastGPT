import axios from 'axios';
import { MongoOutLink } from './schema';

export const updateOutLinkUsage = async ({
  shareId,
  total
}: {
  shareId: string;
  total: number;
}) => {
  try {
    await MongoOutLink.findOneAndUpdate(
      { shareId },
      {
        $inc: { total },
        lastTime: new Date()
      }
    );
  } catch (err) {
    console.log('update shareChat error', err);
  }
};

export const pushResult2Remote = async ({
  outLinkUid,
  shareId,
  responseData
}: {
  outLinkUid?: string; // raw id, not parse
  shareId?: string;
  responseData?: any[];
}) => {
  if (!shareId || !outLinkUid || !global.systemEnv?.pluginBaseUrl) return;
  try {
    const outLink = await MongoOutLink.findOne({
      shareId
    });
    if (!outLink?.limit?.hookUrl) return;

    axios({
      method: 'post',
      baseURL: outLink.limit.hookUrl,
      url: '/shareAuth/finish',
      data: {
        token: outLinkUid,
        responseData
      }
    });
  } catch (error) {}
};
