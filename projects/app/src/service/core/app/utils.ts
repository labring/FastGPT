import { getUserChatInfoAndAuthTeamPoints } from '@/service/support/permission/auth/team';
import { pushChatUsage } from '@/service/support/wallet/usage/push';
import { defaultApp } from '@/web/core/app/constants';
import { getNextTimeByCronStringAndTimezone } from '@fastgpt/global/common/string/time';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { delay } from '@fastgpt/global/common/system/utils';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  getWorkflowEntryNodeIds,
  initWorkflowEdgeStatus,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { WORKFLOW_MAX_RUN_TIMES } from '@fastgpt/service/core/workflow/constants';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';

export const getScheduleTriggerApp = async () => {
  // 1. Find all the app
  const apps = await MongoApp.find({
    scheduledTriggerConfig: { $ne: null },
    scheduledTriggerNextTime: { $lte: new Date() }
  });

  // 2. Run apps
  await Promise.allSettled(
    apps.map(async (app) => {
      if (!app.scheduledTriggerConfig) return;
      // random delay 0 ~ 60s
      await delay(Math.floor(Math.random() * 60 * 1000));
      const { user } = await getUserChatInfoAndAuthTeamPoints(app.tmbId);

      try {
        const { flowUsages } = await dispatchWorkFlow({
          chatId: getNanoid(),
          user,
          mode: 'chat',
          runningAppInfo: {
            id: String(app._id),
            teamId: String(app.teamId),
            tmbId: String(app.tmbId)
          },
          uid: String(app.tmbId),
          runtimeNodes: storeNodes2RuntimeNodes(app.modules, getWorkflowEntryNodeIds(app.modules)),
          runtimeEdges: initWorkflowEdgeStatus(app.edges),
          variables: {},
          query: [
            {
              type: ChatItemValueTypeEnum.text,
              text: {
                content: app.scheduledTriggerConfig?.defaultPrompt
              }
            }
          ],
          chatConfig: defaultApp.chatConfig,
          histories: [],
          stream: false,
          maxRunTimes: WORKFLOW_MAX_RUN_TIMES
        });
        pushChatUsage({
          appName: app.name,
          appId: app._id,
          teamId: String(app.teamId),
          tmbId: String(app.tmbId),
          source: UsageSourceEnum.cronJob,
          flowUsages
        });
      } catch (error) {
        addLog.error('Schedule trigger error', error);
      }

      // update next time
      app.scheduledTriggerNextTime = getNextTimeByCronStringAndTimezone(app.scheduledTriggerConfig);
      await app.save();

      return;
    })
  );
};
