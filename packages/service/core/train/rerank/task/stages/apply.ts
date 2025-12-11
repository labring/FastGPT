import { UnrecoverableError } from 'bullmq';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { MongoApp } from '../../../../../core/app/schema';
import { MongoAppVersion } from '../../../../../core/app/version/schema';
import { mongoSessionRun } from '../../../../../common/mongo/sessionRun';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getDefaultRerankModel } from '../../../../ai/model';
import { addLog } from '../../../../../common/system/log';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

/**
 * Stage 5: Apply update
 * Creates a new app version and replaces rerank model configurations in the new version
 *
 * @param task - Rerank training task instance
 * @returns Object containing versionId, versionName, previousModelConfigId, and updatedNodesCount
 * @throws UnrecoverableError if tuned model config ID not found or no nodes to update
 */
export async function runApplyingStage(task: RerankTrainTaskSchemaType): Promise<{
  versionId: string;
  versionName: string;
  previousModelConfigId?: string;
  updatedNodesCount: number;
}> {
  addLog.info('Run applying stage', { taskId: String(task._id) });

  const checkpointData = task.checkpoint.data || {};
  const tunedModelConfigId = checkpointData.registering?.tunedModelConfigId;

  if (!tunedModelConfigId) {
    throw new UnrecoverableError('Tuned model config ID not found in checkpoint');
  }

  const app = await MongoApp.findById(task.appId).lean();
  if (!app) {
    throw new UnrecoverableError('Application not found');
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
    throw new UnrecoverableError(
      'No rerank model nodes found to update. The application workflow may have been modified or no longer uses the base model.'
    );
  }

  const versionName = `${task.name} - Fine-tuned (${new Date().toLocaleDateString()})`;

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
      previousModelConfigId
    });

    return {
      versionId: String(versionId),
      versionName,
      previousModelConfigId,
      updatedNodesCount: updatedNodes
    };
  });

  return result;
}
