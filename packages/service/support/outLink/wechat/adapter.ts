import type { OutlinkMessage, OutlinkResponder } from '../../../support/outLink/runtime/type';
import type { WechatReplyJobData } from './type';
import type { ILinkClient } from './ilinkClient';

type CreateWechatOutlinkAdapterProps = {
  client: ILinkClient;
  jobData: WechatReplyJobData;
};

/** 将 iLink 回复任务转换为共享 runtime 消息，并把终态事件发送回微信。 */
export const createWechatOutlinkAdapter = ({
  client,
  jobData
}: CreateWechatOutlinkAdapterProps) => {
  const normalizeMessage = async (): Promise<OutlinkMessage> => ({
    chatId: `wechat_${jobData.shareId}_${jobData.userId}`,
    messageId: jobData.lastMsgId,
    chatUserId: jobData.userId,
    query: [{ text: { content: jobData.text } }]
  });

  const respond: OutlinkResponder = async (events) => {
    for await (const event of events) {
      if (event.type !== 'done' && event.type !== 'error') continue;

      await client.sendMessage({
        to_user_id: jobData.userId,
        text: event.content,
        context_token: jobData.contextToken
      });
    }
  };

  return { normalizeMessage, respond };
};
