import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  getWorkflowEntryNodeIds,
  getMaxHistoryLimitFromNodes,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import type { OutlinkAppType, OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';
import { getAppLatestVersion } from '../../../core/app/version/controller';
import { MongoApp } from '../../../core/app/schema';
import { getChatItems } from '../../../core/chat/controller';
import { pushChatRecords } from '../../../core/chat/saveChat';
import { dispatchWorkFlow } from '../../../core/workflow/dispatch';
import { getUserChatInfo } from '../../../support/user/team/utils';
import { getRunningUserInfoByTmbId } from '../../../support/user/team/utils';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { NextApiResponse } from 'next';
import { authOutLinkLimit } from './auth';
import { addOutLinkUsage } from '../../../support/outLink/tools';
import { getLogger, LogCategories } from '../../../common/logger';
import { appendRedisCache } from '../../../common/redis/cache';
import { getErrResponse, getErrText } from '@fastgpt/global/common/error/utils';
import { getUsageSourceByPublishChannel } from '@fastgpt/global/support/wallet/usage/tools';
import {
  getChatSourceByPublishChannel,
  removeAIResponseCite
} from '@fastgpt/global/core/chat/utils';
import { WORKFLOW_MAX_RUN_TIMES } from '../../../core/workflow/constants';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoChat } from '../../../core/chat/chatSchema';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoChatItem } from '../../../core/chat/chatItemSchema';

const logger = getLogger(LogCategories.MODULE.OUTLINK);

// 新开历史记录, 把原来 chatId 替换
const RESET_CHAT_INPUT: Record<string, boolean> = {
  Reset: true,
  '/reset': true
};
const RESET_CHAT_REPLY = '对话已重置。\n\n The chat records have been reset.';
export const resetChat = ({ appId, chatId }: { appId: string; chatId: string }) => {
  const newChatId = getNanoid(26);
  return mongoSessionRun(async (session) => {
    await MongoChat.updateOne(
      {
        appId,
        chatId
      },
      {
        $set: {
          chatId: newChatId
        }
      },
      { session }
    );
    await MongoChatItem.updateMany(
      {
        appId,
        chatId
      },
      {
        $set: {
          chatId: newChatId
        }
      },
      { session }
    );
  });
};

export type outLinkInvokeChatProps<T extends OutlinkAppType> = {
  outLinkConfig: OutLinkSchemaType<T>;
  chatId: string; // specific chat
  query: UserChatItemValueItemType[];
  res?: NextApiResponse;
  messageId: string;
  chatUserId: string;
  // Called once with complete response content (all channels except wecom)
  onReply?: (replyContent: string) => Promise<void>;
  // Called for each streaming chunk (feishu and other push channels)
  onStreamChunk?: (text: string) => Promise<void>;
  streamId?: string;
};

const DEFAULT_REPLY = 'This is default reply';

export const STREAM_END_FLAG = '[DONE]';
export const STREAM_CACHE_KEY_PREFIX = 'streamResponse:';

export async function outlinkInvokeChat<T extends OutlinkAppType>({
  outLinkConfig,
  chatId,
  query,
  res,
  messageId,
  chatUserId,
  onReply,
  onStreamChunk,
  streamId
}: outLinkInvokeChatProps<T>) {
  const streamResKey = `${STREAM_CACHE_KEY_PREFIX}${streamId}`;

  try {
    // Get app workflow config
    const [app, { nodes, chatConfig, edges }, { timezone, externalProvider }] = await Promise.all([
      MongoApp.findById(outLinkConfig.appId).lean(),
      getAppLatestVersion(outLinkConfig.appId),
      getUserChatInfo(outLinkConfig.tmbId)
    ]);

    if (!nodes || !chatConfig || !app) {
      return Promise.reject('Invalid chat');
    }

    // Check whether the chatId is valid
    const userQuestion = query.find((item) => item.text)?.text?.content || '';
    if (RESET_CHAT_INPUT[userQuestion]) {
      await resetChat({ appId: outLinkConfig.appId, chatId });
      await onReply?.(RESET_CHAT_REPLY);
      if (streamId) {
        await appendRedisCache(streamResKey, RESET_CHAT_REPLY, 60);
        await appendRedisCache(streamResKey, STREAM_END_FLAG, 60);
      }
      return;
    }

    // Load chat histories and global variables in parallel
    const [{ histories }, chatDetail] = await Promise.all([
      getChatItems({
        appId: outLinkConfig.appId,
        chatId,
        offset: 0,
        limit: getMaxHistoryLimitFromNodes(nodes),
        field: `obj value`
      }),
      MongoChat.findOne({ appId: outLinkConfig.appId, chatId }, 'source variableList variables')
    ]);

    // dedupe
    if (histories.find((item) => item.dataId === messageId)) {
      return; // dupelicated messaage, do noting
    }

    await authOutLinkLimit({
      outLinkUid: chatUserId,
      outLink: outLinkConfig as any, // HACK, we do not need to provide app: T
      question: userQuestion,
      ip: chatId
    });

    const enableStreaming = !!streamId || !!onStreamChunk;

    const workflowStreamResponse = enableStreaming
      ? async ({
          write,
          event,
          data
        }: {
          write?: (text: string) => void;
          event?: SseResponseEventEnum;
          data: string | Record<string, any>;
        }) => {
          if (!event || typeof data === 'string') return;

          if (event === SseResponseEventEnum.answer || event === SseResponseEventEnum.fastAnswer) {
            try {
              const text = data.choices?.[0]?.delta?.content;
              if (text) {
                if (streamId) {
                  await appendRedisCache(streamResKey, text, 60);
                }
                if (onStreamChunk) {
                  await onStreamChunk(text);
                }
              }
            } catch (error) {
              logger.error('Outlink real-time streaming failed', {
                streamId,
                messageId,
                error
              });
            }
          }
        }
      : undefined;

    // Initialize Redis key only when needed
    if (streamId) {
      await appendRedisCache(streamResKey, '', 120);
    }

    // Merge global variables from database
    const variables = chatDetail?.variables ?? {};

    const {
      assistantResponses,
      newVariables,
      flowResponses,
      flowUsages,
      durationSeconds,
      system_memories
    } = await dispatchWorkFlow({
      apiVersion: 'v2',
      res,
      mode: 'chat',
      usageSource: getUsageSourceByPublishChannel(outLinkConfig.type),
      runningAppInfo: {
        id: String(app._id),
        name: app.name,
        teamId: app.teamId,
        tmbId: app.tmbId
      },
      runningUserInfo: await getRunningUserInfoByTmbId(app.tmbId),
      uid: chatUserId || outLinkConfig.tmbId,
      chatId,
      variables,
      histories,
      query: query,
      chatConfig,
      stream: enableStreaming,
      workflowStreamResponse,
      runtimeEdges: storeEdges2RuntimeEdges(edges),
      runtimeNodes: storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes)),
      maxRunTimes: WORKFLOW_MAX_RUN_TIMES,
      retainDatasetCite: false
    });

    // Format results
    const formatAssistantResponses = removeAIResponseCite(assistantResponses, false);
    let responseContent = formatAssistantResponses
      .map((response) => {
        return response.text?.content;
      })
      .filter(Boolean)
      .join('\n')
      .trim();
    if (responseContent.length === 0) {
      responseContent = DEFAULT_REPLY;
    }

    const replyResult = await (async () => {
      try {
        if (streamId) {
          // wecom model: Redis handles streaming, no reply needed
          return { success: true };
        }
        await onReply?.(responseContent);
        return { success: true };
      } catch (error) {
        logger.error('Outlink reply callback failed', { error: getErrResponse(error) });
        return {
          success: false,
          errmsg: getErrText(error)
        };
      }
    })();

    // Save and reply
    await pushChatRecords({
      chatId,
      appId: app._id,
      teamId: outLinkConfig.teamId,
      tmbId: outLinkConfig.tmbId,
      outLinkUid: chatUserId,
      nodes,
      appChatConfig: chatConfig,
      variables: newVariables,
      newTitle: String(userQuestion || '').slice(0, 8),
      shareId: outLinkConfig.shareId,
      source: getChatSourceByPublishChannel(outLinkConfig.type),
      sourceName: outLinkConfig.name,
      userContent: {
        dataId: messageId,
        obj: ChatRoleEnum.Human,
        value: query
      },
      aiContent: {
        obj: ChatRoleEnum.AI,
        value: assistantResponses,
        [DispatchNodeResponseKeyEnum.nodeResponse]: flowResponses,
        memories: system_memories
      },
      metadata: {},
      durationSeconds,
      errorMsg: replyResult?.success ? undefined : replyResult?.errmsg
    });

    const totalPoints = flowUsages.reduce((sum, item) => sum + (item.totalPoints || 0), 0);
    addOutLinkUsage({
      shareId: outLinkConfig.shareId,
      totalPoints: totalPoints
    });

    if (streamId) {
      await appendRedisCache(streamResKey, STREAM_END_FLAG, 60);
    }
  } catch (error) {
    logger.error('Outlink invoke chat failed', {
      shareId: outLinkConfig.shareId,
      chatId,
      messageId,
      streamId,
      error
    });

    try {
      if (streamId) {
        await appendRedisCache(streamResKey, STREAM_END_FLAG, 60);
      }
      await onReply?.(`App run error: ${getErrText(error)}`);
    } catch (error) {
      logger.error('Outlink invoke chat fallback reply failed', {
        shareId: outLinkConfig.shareId,
        chatId,
        messageId,
        streamId,
        error
      });
    }
  }
}
