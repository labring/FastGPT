import { addLog } from '@/service/utils/tools';
import { ChatHistoryItemResType } from '@/types/chat';
import axios from 'axios';
import { OutLink } from './schema';

export const updateOutLinkUsage = async ({
  shareId,
  total
}: {
  shareId: string;
  total: number;
}) => {
  try {
    await OutLink.findOneAndUpdate(
      { shareId },
      {
        $inc: { total },
        lastTime: new Date()
      }
    );
  } catch (err) {
    addLog.error('update shareChat error', err);
  }
};

export const pushResult2Remote = async ({
  authToken,
  shareId,
  responseData
}: {
  authToken?: string;
  shareId?: string;
  responseData?: ChatHistoryItemResType[];
}) => {
  if (!shareId || !authToken) return;
  try {
    const outLink = await OutLink.findOne({
      shareId
    });
    if (!outLink?.limit?.hookUrl) return;

    axios({
      method: 'post',
      baseURL: outLink.limit.hookUrl,
      url: '/shareAuth/finish',
      data: {
        token: authToken,
        responseData
      }
    });
  } catch (error) {}
};
