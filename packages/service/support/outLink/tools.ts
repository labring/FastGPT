import axios from 'axios';
import { MongoOutLink } from './schema';
import { FastGPTProUrl } from '../../common/system/constants';

export const addOutLinkUsage = async ({
  shareId,
  totalPoints
}: {
  shareId: string;
  totalPoints: number;
}) => {
  MongoOutLink.findOneAndUpdate(
    { shareId },
    {
      $inc: { usagePoints: totalPoints },
      lastTime: new Date()
    }
  ).catch((err) => {
    console.log('update shareChat error', err);
  });
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
  if (!shareId || !outLinkUid || !FastGPTProUrl) return;
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
