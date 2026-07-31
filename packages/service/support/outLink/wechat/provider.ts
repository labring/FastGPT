import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { WechatAppSchema, type WechatAppType } from '@fastgpt/global/support/outLink/type';
import { getLogger, LogCategories } from '../../../common/logger';
import { loadOutlinkProviderConfig } from '../../permission/publish/authLink';
import { runOutlinkRuntime } from '../runtime/service';
import type { OutlinkProviderMessageHandler } from '../runtime/type';
import { ILinkClient } from './ilinkClient';
import { createWechatOutlinkAdapter } from './adapter';
import type { WechatReplyJobData } from './type';

const logger = getLogger(LogCategories.MODULE.OUTLINK.WECHAT);

type WechatOutlinkProvider = (jobData: WechatReplyJobData) => Promise<void>;

/** 创建 iLink 回复任务 Provider，连接渠道配置、消息 Adapter 和共享 runtime。 */
export const createWechatOutlinkProvider =
  ({
    onMessage
  }: {
    onMessage: OutlinkProviderMessageHandler<WechatAppType>;
  }): WechatOutlinkProvider =>
  async (jobData) => {
    const outLinkConfig = await loadOutlinkProviderConfig<WechatAppType>({
      shareId: jobData.shareId,
      channel: PublishChannelEnum.wechat,
      appSchema: WechatAppSchema
    }).catch((error) => {
      if (error === OutLinkErrEnum.linkUnInvalid) {
        logger.warn('Wechat outlink is unavailable', { shareId: jobData.shareId });
        return undefined;
      }
      throw error;
    });

    if (!outLinkConfig) return;

    if (outLinkConfig.app.status !== 'online' || !outLinkConfig.app.token) {
      logger.warn('Wechat channel is unavailable', { shareId: jobData.shareId });
      return;
    }

    const client = new ILinkClient(outLinkConfig.app.baseUrl, outLinkConfig.app.token);
    const adapter = createWechatOutlinkAdapter({
      client,
      jobData
    });
    const message = await adapter.normalizeMessage();

    await onMessage({
      outLinkConfig,
      message,
      respond: adapter.respond
    });
  };

export const wechatOutlinkProvider = createWechatOutlinkProvider({
  onMessage: runOutlinkRuntime
});
