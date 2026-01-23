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
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
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
      RerankTrainErrEnum.applyModelConfigNotFound,
      RerankTrainSuggestionEnum.applyModelConfigNotFound
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const app = await MongoApp.findById(task.appId).lean();
  if (!app) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.applying,
      RerankTrainErrEnum.applyAppDeleted,
      RerankTrainSuggestionEnum.applyAppDeleted
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  addLog.info('Apply stage: App data loaded', {
    taskId: String(task._id),
    appId: String(app._id),
    modulesCount: app.modules?.length || 0,
    baseModelConfigId: task.baseModelConfigId
  });

  let updatedNodes = 0;
  let previousModelConfigId: string | undefined;

  // Deep copy to avoid modifying original configuration
  const updatedModules = JSON.parse(JSON.stringify(app.modules || [])) as StoreNodeItemType[];

  // Replace rerank model configuration in the new version
  // Replace ALL datasetSearchNode rerank models with the tuned model
  // This handles cases where the app may have been updated by another task during training
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

    // Get current model config ID for logging and tracking previous model
    const currentModelConfigId = rerankModelInput.value
      ? String(rerankModelInput.value)
      : getDefaultRerankModel()?.model;

    // Record original model config ID (only once, for auto-delete logic)
    if (!previousModelConfigId && currentModelConfigId) {
      previousModelConfigId = currentModelConfigId;
    }

    // Replace with tuned model
    addLog.info('Apply stage: Replacing rerank model', {
      taskId: String(task._id),
      nodeId: node.nodeId,
      previousModel: currentModelConfigId || '(empty/default)',
      newModel: tunedModelConfigId
    });

    rerankModelInput.value = tunedModelConfigId;
    updatedNodes++;
  });

  if (updatedNodes === 0) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.applying,
      RerankTrainErrEnum.applyNoNodesToUpdate,
      RerankTrainSuggestionEnum.applyNoNodesToUpdate
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
      RerankTrainErrEnum.applyDatabaseUpdateFailed,
      RerankTrainSuggestionEnum.applyDatabaseUpdateFailed,
      errorMsg
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }
}
