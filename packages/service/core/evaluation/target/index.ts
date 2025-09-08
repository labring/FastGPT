import type {
  TargetInput,
  TargetOutput,
  WorkflowConfig,
  EvalTarget
} from '@fastgpt/global/core/evaluation/type';
import { dispatchWorkFlow } from '../../workflow/dispatch';
import { getAppVersionById } from '../../app/version/controller';
import { MongoApp } from '../../app/schema';
import {
  getWorkflowEntryNodeIds,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  ChatItemValueTypeEnum,
  ChatRoleEnum,
  ChatSourceEnum
} from '@fastgpt/global/core/chat/constants';
import type {
  UserChatItemValueItemType,
  UserChatItemType,
  AIChatItemType
} from '@fastgpt/global/core/chat/type';
import { WORKFLOW_MAX_RUN_TIMES } from '../../workflow/constants';
import { getUserChatInfoAndAuthTeamPoints } from '../../../support/permission/auth/team';
import { getRunningUserInfoByTmbId } from '../../../support/user/team/utils';
import { removeDatasetCiteText } from '../../ai/utils';
import { saveChat } from '../../chat/saveChat';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';

// Helper function to extract retrieval context from workflow results
function extractRetrievalContext(flowResponses: ChatHistoryItemResType[]): string[] {
  const retrievalContext: string[] = [];

  // Find all datasetSearchNode responses
  const datasetSearchResponses = flowResponses.filter(
    (response) => response.moduleType === FlowNodeTypeEnum.datasetSearchNode
  );

  // Extract quoteList from each datasetSearchNode response
  for (const response of datasetSearchResponses) {
    if (response.quoteList && Array.isArray(response.quoteList)) {
      for (const quote of response.quoteList) {
        // Extract the content from q and a fields and combine them
        const content = [quote.q, quote.a].filter(Boolean).join('\n').trim();
        if (content) {
          retrievalContext.push(content);
        }
      }
    }
  }

  return retrievalContext;
}

// Evaluation target base class
export abstract class EvaluationTarget {
  abstract execute(input: TargetInput): Promise<TargetOutput>;
  abstract validate(): Promise<{ isValid: boolean; message?: string }>;
}

// Workflow target implementation
export class WorkflowTarget extends EvaluationTarget {
  private config: WorkflowConfig;

  constructor(config: WorkflowConfig) {
    super();
    this.config = config;
  }

  async execute(input: TargetInput): Promise<TargetOutput> {
    const startTime = Date.now();

    // Get application information
    const appData = await MongoApp.findById(this.config.appId);
    if (!appData) {
      throw new Error('App not found');
    }

    // Get user information and permissions
    const [{ timezone, externalProvider }, { nodes, edges, chatConfig }] = await Promise.all([
      getUserChatInfoAndAuthTeamPoints(appData.tmbId),
      getAppVersionById({
        appId: String(appData._id),
        versionId: this.config.versionId,
        app: appData
      })
    ]);

    // Construct query
    const query: UserChatItemValueItemType[] = [
      {
        type: ChatItemValueTypeEnum.text,
        text: {
          content: input.userInput
        }
      }
    ];

    // TODO: In the future, construct conversation history based on input.context
    const histories: any[] = [];

    const chatId = getNanoid();

    // Execute workflow
    const { assistantResponses, flowUsages, flowResponses, system_memories, durationSeconds } =
      await dispatchWorkFlow({
        chatId,
        timezone,
        externalProvider,
        mode: 'chat',
        runningAppInfo: {
          id: String(appData._id),
          teamId: String(appData.teamId),
          tmbId: String(appData.tmbId)
        },
        runningUserInfo: await getRunningUserInfoByTmbId(appData.tmbId),
        uid: String(appData.tmbId),
        runtimeNodes: storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes)),
        runtimeEdges: storeEdges2RuntimeEdges(edges),
        variables: input.globalVariables || {},
        query,
        chatConfig: { ...chatConfig, ...(this.config.chatConfig || {}) },
        histories,
        stream: false,
        maxRunTimes: WORKFLOW_MAX_RUN_TIMES
      });

    const response = removeDatasetCiteText(assistantResponses[0]?.text?.content || '', false);

    // Construct user question object
    const userQuestion: UserChatItemType = {
      obj: ChatRoleEnum.Human,
      value: query
    };

    // Construct AI response object
    const aiResponse: AIChatItemType = {
      obj: ChatRoleEnum.AI,
      value: assistantResponses,
      memories: system_memories,
      [DispatchNodeResponseKeyEnum.nodeResponse]: flowResponses
    };

    // Save chat record
    await saveChat({
      chatId,
      appId: appData._id,
      teamId: appData.teamId,
      tmbId: appData.tmbId,
      nodes,
      appChatConfig: { ...chatConfig, ...(this.config.chatConfig || {}) },
      variables: input.globalVariables || {},
      isUpdateUseTime: false,
      newTitle: getChatTitleFromChatMessage(userQuestion),
      source: ChatSourceEnum.evaluation,
      content: [userQuestion, aiResponse],
      durationSeconds
    });

    return {
      actualOutput: response,
      retrievalContext: extractRetrievalContext(flowResponses),
      usage: flowUsages,
      responseTime: Date.now() - startTime
    };
  }

  async validate(): Promise<{ isValid: boolean; message?: string }> {
    try {
      const appData = await MongoApp.findById(this.config.appId);
      if (!appData) {
        return {
          isValid: false,
          message: `App with ID '${this.config.appId}' not found or not accessible`
        };
      }

      // If versionId is specified, validate that the version exists and is accessible
      if (this.config.versionId) {
        const versionData = await getAppVersionById({
          appId: String(appData._id),
          versionId: this.config.versionId,
          app: appData
        });
        // If versionId was specified but the returned version doesn't match (fell back to latest),
        // it means the specified version doesn't exist
        if (String(versionData.versionId).trim() !== String(this.config.versionId).trim()) {
          return {
            isValid: false,
            message: `App version '${this.config.versionId}' not found for app '${appData.name}' (${this.config.appId}). Available version: ${versionData.versionId}`
          };
        }
      }

      return {
        isValid: true,
        message: `App '${appData.name}' is valid and accessible`
      };
    } catch (error) {
      return {
        isValid: false,
        message: `Validation failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}

// Target factory - currently only supports workflow type
export function createTargetInstance(targetConfig: EvalTarget): EvaluationTarget {
  switch (targetConfig.type) {
    case 'workflow':
      return new WorkflowTarget(targetConfig.config as WorkflowConfig);
    default:
      throw new Error(
        `Unsupported target type: ${targetConfig.type}. Only 'workflow' is currently supported.`
      );
  }
}

// Utility function - test the validity of target configuration
export async function validateTargetConfig(
  targetConfig: EvalTarget
): Promise<{ success: boolean; message: string }> {
  try {
    const targetInstance = createTargetInstance(targetConfig);
    const validationResult = await targetInstance.validate();

    return {
      success: validationResult.isValid,
      message:
        validationResult.message ||
        (validationResult.isValid
          ? 'Target config is valid and accessible'
          : 'Target config validation failed')
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}
