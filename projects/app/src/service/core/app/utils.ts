import { getErrText } from '@fastgpt/global/common/error/utils';
import { getNextTimeByCronStringAndTimezone } from '@fastgpt/global/common/string/time';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { batchRunSettled, retryFn } from '@fastgpt/global/common/system/utils';
import {
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import type {
  UserChatItemType,
  AIChatItemValueItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import type { WorkflowRuntimeSummaryType } from '@fastgpt/service/core/workflow/dispatch/type';
import {
  getWorkflowEntryNodeIds,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLogger } from '@fastgpt/service/common/logger';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import {
  failChatRound,
  finalizeChatRound,
  type Props as SaveChatProps
} from '@fastgpt/service/core/chat/saveChat';
import { preChatRound } from '@fastgpt/service/core/chat/utils/prepare';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { prepareWorkflowFileQuery } from '@fastgpt/service/core/workflow/utils/fileLimits';
import { getRunningUserInfoByTmbId } from '@fastgpt/service/support/user/team/utils';
import { createChatUsageRecord } from '@fastgpt/service/support/wallet/usage/controller';
import { createWorkflowResourceContext } from '@fastgpt/service/core/workflow/resource/context';

const logger = getLogger();

/**
 * 扫描到期应用并原子领取本次计划；领取时推进下次时间，同一到期快照只有一个实例能领取。
 * 不补跑停机期间错过的每个时间点；不同时间点可并行执行，旧任务收尾不覆盖新发布的计划。
 * 领取后进程退出可能丢失本次执行，本入口不提供持久化任务队列的投递保证。
 */
export const getScheduleTriggerApp = async () => {
  const startAt = new Date();
  logger.info('Schedule trigger scan started', { startAt });

  // 1. Find all the app
  const apps = await retryFn(() => {
    return MongoApp.find(
      {
        deleteTime: null,
        scheduledTriggerConfig: { $exists: true },
        scheduledTriggerNextTime: { $lte: startAt }
      },
      {
        _id: 1,
        scheduledTriggerConfig: 1,
        scheduledTriggerNextTime: 1,
        name: 1,
        teamId: 1,
        tmbId: 1,
        publishedVersionId: 1
      }
    ).lean();
  });
  logger.info('Schedule trigger scan completed', { dueCount: apps.length, startAt });

  // 2. Run apps
  const results = await batchRunSettled(
    apps,
    async (app) => {
      if (!app.scheduledTriggerConfig?.cronString || !app.scheduledTriggerNextTime) return;

      const nextTime = getNextTimeByCronStringAndTimezone(app.scheduledTriggerConfig);
      if (!Number.isFinite(nextTime.getTime()) || nextTime.getTime() <= Date.now()) {
        throw new Error('Scheduled trigger must have a valid future execution time');
      }

      // 在模型调用、计费和聊天落库前领取。配置或发布版本已变化时丢弃本次扫描快照。
      // 不重试不确定结果的领取写入，避免已领取后又用旧快照执行。
      const claimed = await MongoApp.updateOne(
        {
          _id: app._id,
          deleteTime: null,
          scheduledTriggerNextTime: app.scheduledTriggerNextTime,
          scheduledTriggerConfig: app.scheduledTriggerConfig,
          publishedVersionId: app.publishedVersionId ?? null
        },
        { $set: { scheduledTriggerNextTime: nextTime } }
      );
      if (claimed.matchedCount !== 1) return;

      const chatId = getNanoid();
      const responseChatItemId = getNanoid(24);
      let chatRoundFinalized = false;

      // Get app latest version
      const workflowVersion = await retryFn(() => getAppLatestVersion(app._id, app));
      const { versionId, nodes, edges, chatConfig, resources } = workflowVersion;
      const userQuery: UserChatItemValueItemType[] = [
        {
          text: {
            content: app.scheduledTriggerConfig.defaultPrompt || ''
          }
        }
      ];
      const {
        query: workflowQuery,
        maxFileAmount,
        maxBytesPerFile
      } = await prepareWorkflowFileQuery({
        teamId: String(app.teamId),
        chatConfig,
        query: userQuery
      });

      const usageId = await retryFn(() =>
        createChatUsageRecord({
          appName: app.name,
          appId: app._id,
          teamId: app.teamId,
          tmbId: app.tmbId,
          source: UsageSourceEnum.cronJob
        })
      );

      const userContent: UserChatItemType & { dataId?: string } = {
        obj: ChatRoleEnum.Human,
        value: workflowQuery
      };
      const chatSource = {
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(app._id)
      };

      const preparedRound = await preChatRound({
        ...chatSource,
        chatId,
        teamId: String(app.teamId),
        tmbId: String(app.tmbId),
        source: ChatSourceEnum.cronJob,
        userContent,
        responseChatItemId
      });

      const saveChatRound = async ({
        error,
        durationSeconds = 0,
        assistantResponses = [],
        system_memories,
        customFeedbacks,
        workflowRuntimeSummary
      }: {
        error?: any;
        durationSeconds?: number;
        assistantResponses?: AIChatItemValueItemType[];
        system_memories?: Record<string, any>;
        customFeedbacks?: string[];
        workflowRuntimeSummary?: WorkflowRuntimeSummaryType;
      }) => {
        if (!preparedRound.shouldFinalizePreparedRound) {
          return;
        }

        const saveParams: SaveChatProps = {
          ...chatSource,
          chatId: preparedRound.chatId,
          versionId,
          teamId: String(app.teamId),
          tmbId: String(app.tmbId),
          nodes,
          appChatConfig: chatConfig,
          variables: {},
          source: ChatSourceEnum.cronJob,
          userContent,
          aiContent: {
            obj: ChatRoleEnum.AI,
            dataId: preparedRound.responseChatItemId,
            value: assistantResponses,
            memories: system_memories,
            customFeedbacks
          },
          durationSeconds,
          errorMsg: getErrText(error),
          workflowRuntimeSummary
        };

        await finalizeChatRound(saveParams);
        chatRoundFinalized = true;
      };

      try {
        const {
          assistantResponses,
          durationSeconds,
          system_memories,
          customFeedbacks,
          workflowRuntimeSummary
        } = await retryFn(async () => {
          return dispatchWorkFlow({
            chatId: preparedRound.chatId,
            responseChatItemId: preparedRound.responseChatItemId,
            mode: 'chat',
            usageId,
            runningAppInfo: {
              sourceType: ChatSourceTypeEnum.app,
              sourceId: String(app._id),
              name: app.name,
              teamId: String(app.teamId),
              tmbId: String(app.tmbId)
            },
            runningUserInfo: await getRunningUserInfoByTmbId(app.tmbId),
            uid: String(app.tmbId),
            runtimeNodes: storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes)),
            runtimeEdges: storeEdges2RuntimeEdges(edges),
            resourceContext: createWorkflowResourceContext({
              resources,
              teamId: app.teamId
            }),
            variables: {},
            query: workflowQuery,
            maxFileAmount,
            maxBytesPerFile,
            chatConfig,
            histories: [],
            stream: false,
            maxRunTimes: WORKFLOW_MAX_RUN_TIMES,
            nodeResponseWriteConfig: {
              persistToDb: true,
              retainInMemory: false
            }
          });
        });

        // Save chat
        await saveChatRound({
          error: workflowRuntimeSummary?.errorText,
          durationSeconds,
          assistantResponses,
          system_memories,
          customFeedbacks,
          workflowRuntimeSummary
        });
      } catch (error) {
        logger.error('Schedule trigger workflow run failed', {
          error,
          appId: app._id,
          appName: app.name,
          teamId: app.teamId,
          tmbId: app.tmbId,
          chatId,
          usageId
        });

        if (!chatRoundFinalized && preparedRound?.shouldPersistChatRound) {
          if (preparedRound.shouldFinalizePreparedRound) {
            await failChatRound({
              ...chatSource,
              chatId: preparedRound.chatId,
              responseChatItemId: preparedRound.responseChatItemId,
              error
            }).catch();
          }
        }
      } finally {
        await preparedRound?.releaseGenerationLease?.();
      }
    },
    50
  );
  results.forEach((result, index) => {
    if (!result.success) {
      logger.error('Schedule trigger application failed', {
        appId: apps[index]._id,
        error: result.error
      });
    }
  });
};
