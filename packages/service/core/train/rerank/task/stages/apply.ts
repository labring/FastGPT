import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { RerankTaskCheckpointStageEnum } from '@fastgpt/global/core/train/rerank/constants';
import { MongoApp } from '../../../../../core/app/schema';
import { MongoAppVersion } from '../../../../../core/app/version/schema';
import { mongoSessionRun } from '../../../../../common/mongo/sessionRun';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getDefaultRerankModel } from '../../../../ai/model';
import { addLog } from '../../../../../common/system/log';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { TrainTaskErrorType } from '@fastgpt/global/core/train/rerank/error';
import { createEnhancedError } from '../../utils';
import { MongoRerankTrainTask } from '../schema';
import { isTunedModel } from '../helpers/model';
import { TrainTaskUnrecoverableError } from '../errors';

/**
 * Stage 5: Apply update
 * Creates a new app version and replaces rerank model configurations in the new version
 *
 * @param task - Rerank training task instance
 * @returns Object containing versionId, versionName, previousModelConfigId, previousTaskId, and updatedNodesCount
 * @throws UnrecoverableError if tuned model config ID not found or no nodes to update
 */
export async function runApplyingStage(task: RerankTrainTaskSchemaType): Promise<{
  versionId: string;
  versionName: string;
  previousModelConfigId?: string;
  previousTaskId?: string;
  updatedNodesCount: number;
}> {
  addLog.info('Run applying stage', { taskId: String(task._id) });

  const checkpointData = task.checkpoint.data || {};
  const tunedModelConfigId = checkpointData.registering?.tunedModelConfigId;

  if (!tunedModelConfigId) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.applying,
      TrainTaskErrorType.MODEL_CONFIG_INVALID,
      'Tuned model config ID not found from registration stage',
      'Please check if model registration stage completed correctly, or re-run the training task'
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const app = await MongoApp.findById(task.appId).lean();
  if (!app) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.applying,
      TrainTaskErrorType.INTERNAL_ERROR,
      'Application not found or has been deleted',
      'Please check if the application still exists, cannot apply training results if deleted'
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  let updatedNodes = 0;
  let previousModelConfigId: string | undefined;

  // Deep copy to avoid modifying original configuration
  const updatedModules = JSON.parse(JSON.stringify(app.modules || [])) as StoreNodeItemType[];

  // Replace rerank model configuration in the new version
  updatedModules.forEach((node) => {
    if (node.flowNodeType !== FlowNodeTypeEnum.datasetSearchNode) {
      return;
    }

    const rerankModelInput = node.inputs?.find(
      (input) => input.key === NodeInputKeyEnum.datasetSearchRerankModel
    );

    if (!rerankModelInput) {
      return;
    }

    // If value is empty, use system default model (consistent with workflow execution logic)
    const currentModelConfigId = rerankModelInput.value
      ? String(rerankModelInput.value)
      : getDefaultRerankModel()?.model;

    if (!currentModelConfigId) {
      addLog.warn('Node has no rerank model configured and no default model available', {
        taskId: String(task._id),
        nodeId: node.nodeId
      });
      return;
    }

    // Record original model config ID (only once)
    if (!previousModelConfigId) {
      previousModelConfigId = currentModelConfigId;
    }

    // Only replace nodes using the base model
    if (currentModelConfigId === task.baseModelConfigId) {
      rerankModelInput.value = tunedModelConfigId;
      updatedNodes++;
    } else {
      addLog.info('Skipping node with different model configuration', {
        taskId: String(task._id),
        currentModelConfigId,
        expectedModelConfigId: task.baseModelConfigId
      });
    }
  });

  if (updatedNodes === 0) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.applying,
      TrainTaskErrorType.APP_UPDATE_FAILED,
      'No Rerank model nodes found to update in application',
      'Possible reasons: 1) App workflow has been modified 2) App is not using base model 3) Dataset search nodes have no Rerank model configured. Please check app workflow configuration'
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  // Query previous training task if previous model is a tuned model
  let previousTaskId: string | undefined;
  if (previousModelConfigId && isTunedModel(previousModelConfigId)) {
    const previousTask = await MongoRerankTrainTask.findOne(
      {
        'result.tunedModelConfigId': previousModelConfigId
      },
      '_id'
    ).lean();

    if (previousTask) {
      previousTaskId = String(previousTask._id);
      addLog.info('Found previous training task for previous model', {
        taskId: String(task._id),
        previousModelConfigId,
        previousTaskId
      });
    } else {
      addLog.warn('Previous model is tuned but no training task found', {
        taskId: String(task._id),
        previousModelConfigId
      });
    }
  }

  const versionName = `${task.name} - Fine-tuned (${new Date().toLocaleDateString()})`;

  try {
    const result = await mongoSessionRun(async (session) => {
      const [{ _id: versionId }] = await MongoAppVersion.create(
        [
          {
            appId: task.appId,
            tmbId: task.tmbId,
            nodes: updatedModules,
            edges: app.edges || [],
            chatConfig: app.chatConfig || {},
            versionName,
            isPublish: true,
            time: new Date()
          }
        ],
        { session, ordered: true }
      );

      await MongoApp.findByIdAndUpdate(
        task.appId,
        {
          modules: updatedModules,
          edges: app.edges || [],
          chatConfig: app.chatConfig || {},
          updateTime: new Date(),
          version: 'v2',
          'pluginData.nodeVersion': versionId
        },
        { session }
      );

      addLog.info('Created and applied new app version with tuned rerank model', {
        taskId: String(task._id),
        versionId: String(versionId),
        versionName,
        updatedNodes,
        previousModelConfigId,
        previousTaskId
      });

      return {
        versionId: String(versionId),
        versionName,
        previousModelConfigId,
        previousTaskId,
        updatedNodesCount: updatedNodes
      };
    });

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.applying,
      TrainTaskErrorType.DATABASE_ERROR,
      `Failed to update application with tuned model: ${errorMsg}`,
      'This may be a database error. Please check database connection and try again',
      errorMsg
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }
}
