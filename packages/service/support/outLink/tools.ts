import { axios } from '../../common/api/axios';
import { MongoOutLink } from './schema';
import { FastGPTProUrl } from '../../common/system/constants';
import { type ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { getLogger, LogCategories } from '../../common/logger';

const logger = getLogger(LogCategories.MODULE.OUTLINK.TOOLS);

export const addOutLinkUsage = ({
  shareId,
  totalPoints
}: {
  shareId: string;
  totalPoints: number;
}) => {
  return MongoOutLink.findOneAndUpdate(
    { shareId },
    {
      $inc: { usagePoints: totalPoints },
      lastTime: new Date()
    }
  ).catch((err) => {
    logger.error('Failed to update outlink usage', { shareId, error: err });
  });
};

export const pushResult2Remote = async ({
  shareId,
  chatId,
  outLinkUid,
  appName,
  flowResponses
}: {
  shareId: string;
  chatId: string;
  outLinkUid?: string; // raw id, not parse
  appName: string;
  flowResponses?: ChatHistoryItemResType[];
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
        appName,
        responseData: flowResponses,
        chatId
      }
    });
  } catch (error) {
    logger.error('Failed to push outlink result to remote hook', { shareId, error });
  }
};
