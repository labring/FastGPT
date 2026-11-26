import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { WechatAppSchema, type WechatAppType } from '@fastgpt/global/support/outLink/type';
import { getLogger, LogCategories } from '../../../common/logger';
import { loadOutlinkProviderConfig } from '../../permission/publish/authLink';
import { runOutlinkRuntime } from '../runtime/service';
import type { OutlinkProviderMessageHandler } from '../runtime/type';
import { ILinkClient } from './ilinkClient';
import { createWechatOutlinkAdapter } from './adapter';
import { getWechatBindingKey, isActiveWechatConnection } from './utils';
import type { WechatReplyJobData } from '@fastgpt/dal/redis/bullmq';

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

    if (!isActiveWechatConnection(outLinkConfig.app)) {
      logger.warn('Wechat channel is unavailable', { shareId: jobData.shareId });
      return;
    }

    // 历史队列任务在渠道未重新绑定前继续消费；重新扫码后只接收带当前绑定键的任务。
    const bindingKey = jobData.bindingKey;
    if (
      bindingKey === undefined
        ? outLinkConfig.app.bindingId !== undefined
        : bindingKey !== getWechatBindingKey(outLinkConfig.app)
    ) {
      logger.debug('Ignoring reply from an earlier Wechat binding', { shareId: jobData.shareId });
      return;
    }

    const client = new ILinkClient(outLinkConfig.app.baseUrl, outLinkConfig.app.token);
    const adapter = createWechatOutlinkAdapter({
      client,
      jobData,
      appId: outLinkConfig.appId
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
