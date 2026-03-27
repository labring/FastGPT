import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authRerankTrainTask } from '@fastgpt/service/support/permission/train/rerank/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { addLog } from '@fastgpt/service/common/system/log';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { RerankTrainTaskStatusEnum } from '@fastgpt/global/core/train/rerank/constants';
import { RerankTrainErrEnum } from '@fastgpt/global/common/error/code/train';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type {
  ApplyRerankTrainTaskToAppsRequest,
  ApplyRerankTrainTaskToAppsResponse
} from '@fastgpt/global/core/train/rerank/api';
import { beforeUpdateAppFormat } from '@fastgpt/service/core/app/controller';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApplyRerankTrainTaskToAppsResponse>
): Promise<ApplyRerankTrainTaskToAppsResponse> {
  const { taskId, appIds } = req.body as ApplyRerankTrainTaskToAppsRequest;

  if (!taskId || !appIds?.length) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const { task, teamId, tmbId } = await authRerankTrainTask({
    req,
    authToken: true,
    authApiKey: true,
    taskId,
    per: WritePermissionVal
  });

  // Task must be completed with the new model retained
  if (task.status !== RerankTrainTaskStatusEnum.completed) {
    return Promise.reject(RerankTrainErrEnum.taskNotCompleted);
  }

  const newModelKept = task.result?.newModelKept ?? task.checkpoint?.data?.applying?.newModelKept;
  if (!newModelKept) {
    return Promise.reject(RerankTrainErrEnum.tunedModelNotKept);
  }

  // Retrieve the tuned model ID from result or checkpoint
  const tunedModelId =
    task.result?.tunedModelId ?? task.checkpoint?.data?.registering?.tunedModelId;
  if (!tunedModelId) {
    return Promise.reject(RerankTrainErrEnum.tunedModelNotFound);
  }

  // Deduplicate appIds to avoid processing the same app multiple times
  const uniqueAppIds = [...new Set(appIds)];

  // Update the rerank node model in each app's workflow
  let updatedAppsCount = 0;
  const skippedAppIds: string[] = [];

  for (const appId of uniqueAppIds) {
    try {
      // Fetch the app (current team only)
      const app = await MongoApp.findOne({ _id: appId, teamId }).lean();
      if (!app) {
        skippedAppIds.push(appId);
        continue;
      }

      const nodes: StoreNodeItemType[] = app.modules || [];
      let hasRerankNode = false;

      const updatedNodes = nodes.map((node: StoreNodeItemType) => {
        if (node.flowNodeType !== FlowNodeTypeEnum.datasetSearchNode) {
          return node;
        }

        const updatedInputs = node.inputs?.map((input: FlowNodeInputItemType) => {
          if (input.key === NodeInputKeyEnum.datasetSearchRerankModel) {
            hasRerankNode = true;
            addLog.info('Updating rerank model in node', {
              appId,
              nodeId: node.nodeId,
              oldModel: input.value,
              newModel: tunedModelId
            });
            return { ...input, value: tunedModelId };
          }
          return input;
        });

        return { ...node, inputs: updatedInputs };
      });

      if (!hasRerankNode) {
        skippedAppIds.push(appId);
        continue;
      }

      beforeUpdateAppFormat({ nodes: updatedNodes });

      await mongoSessionRun(async (session) => {
        const [{ _id: versionId }] = await MongoAppVersion.create(
          [
            {
              appId,
              tmbId,
              nodes: updatedNodes,
              edges: app.edges || [],
              chatConfig: app.chatConfig,
              isPublish: true,
              versionName: `Apply rerank model: ${tunedModelId}`
            }
          ],
          { session, ordered: true }
        );

        await MongoApp.updateOne(
          { _id: appId },
          {
            modules: updatedNodes,
            updateTime: new Date(),
            'pluginData.nodeVersion': versionId
          },
          { session }
        );
      });

      updatedAppsCount++;
    } catch (err) {
      // Single app failure does not abort the remaining apps; record as skipped
      addLog.error('Failed to apply rerank model to app', {
        appId,
        error: err instanceof Error ? err.message : String(err)
      });
      skippedAppIds.push(appId);
    }
  }

  // Audit log
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.APPLY_RERANK_TRAIN_TASK_TO_APPS,
      params: { taskName: task.name || taskId, appCount: updatedAppsCount, tunedModelId }
    });
  })();

  return { updatedAppsCount, skippedAppIds };
}

export default NextAPI(handler);
