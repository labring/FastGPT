import type {
  TargetInput,
  TargetOutput,
  WorkflowConfig,
  EvalTarget
} from '@fastgpt/global/core/evaluation/type';
import {
  Validatable,
  ValidationResultUtils,
  type ValidationResult,
  type ValidationError
} from '@fastgpt/global/core/evaluation/validate';
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
import { MongoChatItem } from '../../chat/chatItemSchema';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

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
export abstract class EvaluationTarget extends Validatable {
  abstract execute(input: TargetInput): Promise<TargetOutput>;
  // validate() method is inherited from Validatable base class
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
      throw new Error(EvaluationErrEnum.evalAppNotFound);
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

    // Construct conversation history based on input.context
    const histories: (UserChatItemType | AIChatItemType)[] = [];

    // Add context as background knowledge in conversation history
    if (input.context && input.context.length > 0) {
      const contextText = input.context
        .filter((item) => item && item.trim())
        .map((item, index) => `${index + 1}. ${item}`)
        .join('\n');

      if (contextText) {
        histories.push({
          obj: ChatRoleEnum.Human,
          value: [
            {
              type: ChatItemValueTypeEnum.text,
              text: {
                content: `请参考以下背景知识回答问题：\n${contextText}`
              }
            }
          ]
        });
      }
    }

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
        variables: input.targetCallParams?.variables || {},
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
      variables: input.targetCallParams?.variables || {},
      isUpdateUseTime: false,
      newTitle: getChatTitleFromChatMessage(userQuestion),
      source: ChatSourceEnum.evaluation,
      content: [userQuestion, aiResponse],
      durationSeconds
    });

    // Get the latest AI chat item dataId from the saved chat record
    const latestAiChatItem = await MongoChatItem.findOne(
      {
        chatId,
        appId: appData._id,
        obj: ChatRoleEnum.AI
      },
      'dataId'
    )
      .sort({ _id: -1 })
      .lean();

    const aiChatItemDataId = latestAiChatItem?.dataId || '';

    return {
      actualOutput: response,
      retrievalContext: extractRetrievalContext(flowResponses),
      usage: flowUsages,
      responseTime: Date.now() - startTime,
      chatId,
      aiChatItemDataId
    };
  }

  async validate(): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    try {
      // Validate basic configuration
      if (!this.config.appId) {
        errors.push({
          code: EvaluationErrEnum.evalTargetAppIdMissing,
          message: 'App ID is required for workflow target',
          field: 'config.appId'
        });
        return { isValid: false, errors, warnings };
      }

      if (!this.config.versionId) {
        errors.push({
          code: EvaluationErrEnum.evalTargetVersionIdMissing,
          message: 'Version ID is required for workflow target',
          field: 'config.versionId'
        });
        return { isValid: false, errors, warnings };
      }

      // Validate app existence and accessibility
      const appData = await MongoApp.findById(this.config.appId);
      if (!appData) {
        errors.push({
          code: EvaluationErrEnum.evalAppNotFound,
          message: `App with ID '${this.config.appId}' not found or not accessible`,
          field: 'config.appId',
          debugInfo: { appId: this.config.appId }
        });
        return { isValid: false, errors, warnings };
      }

      // Validate that the version exists and is accessible
      try {
        const versionData = await getAppVersionById({
          appId: String(appData._id),
          versionId: this.config.versionId,
          app: appData
        });

        // If versionId was specified but the returned version doesn't match (fell back to latest),
        // it means the specified version doesn't exist
        if (String(versionData.versionId).trim() !== String(this.config.versionId).trim()) {
          errors.push({
            code: EvaluationErrEnum.evalAppVersionNotFound,
            message: `App version '${this.config.versionId}' not found for app '${appData.name}'`,
            field: 'config.versionId',
            debugInfo: {
              appId: this.config.appId,
              appName: appData.name,
              requestedVersion: this.config.versionId,
              availableVersion: versionData.versionId
            }
          });
        }
      } catch (versionError) {
        errors.push({
          code: EvaluationErrEnum.evalAppVersionNotFound,
          message: `Failed to validate app version: ${versionError instanceof Error ? versionError.message : String(versionError)}`,
          field: 'config.versionId',
          debugInfo: {
            appId: this.config.appId,
            requestedVersion: this.config.versionId,
            error: versionError instanceof Error ? versionError.message : String(versionError)
          }
        });
      }

      // Validate chat config if present
      if (this.config.chatConfig) {
        // Add basic validation for chat config structure
        if (typeof this.config.chatConfig !== 'object') {
          errors.push({
            code: EvaluationErrEnum.evalTargetInvalidConfig,
            message: 'Chat config must be an object',
            field: 'config.chatConfig',
            debugInfo: { chatConfigType: typeof this.config.chatConfig }
          });
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error) {
      errors.push({
        code: EvaluationErrEnum.evalTargetConfigInvalid,
        message: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
        debugInfo: {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        }
      });

      return { isValid: false, errors, warnings };
    }
  }
}

// Target factory - creates and validates instance in one step
export async function createTargetInstance(
  targetConfig: EvalTarget,
  options: { validate?: boolean } = { validate: true }
): Promise<EvaluationTarget> {
  let targetInstance: EvaluationTarget;

  switch (targetConfig.type) {
    case 'workflow':
      targetInstance = new WorkflowTarget(targetConfig.config as WorkflowConfig);
      break;
    default:
      throw new Error(EvaluationErrEnum.evalUnsupportedTargetType);
  }

  // Validate instance if requested (default behavior)
  if (options.validate) {
    const validationResult = await targetInstance.validate();
    if (!validationResult.isValid) {
      throw ValidationResultUtils.toError(validationResult);
    }
  }

  return targetInstance;
}

// Utility function - test the validity of target configuration
export async function validateTargetConfig(targetConfig: EvalTarget): Promise<ValidationResult> {
  try {
    const targetInstance = await createTargetInstance(targetConfig, { validate: false });
    return await targetInstance.validate();
  } catch (error) {
    // If we can't even create the instance, return validation error
    return {
      isValid: false,
      errors: [
        {
          code: EvaluationErrEnum.evalTargetConfigInvalid,
          message: `Failed to create target instance: ${error instanceof Error ? error.message : String(error)}`,
          debugInfo: {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            targetType: targetConfig.type
          }
        }
      ]
    };
  }
}
