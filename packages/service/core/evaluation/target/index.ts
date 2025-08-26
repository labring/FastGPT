import type {
  TargetInput,
  TargetOutput,
  WorkflowConfig,
  EvalTarget
} from '@fastgpt/global/core/evaluation/type';
import { dispatchWorkFlow } from '../../workflow/dispatch';
import { getAppLatestVersion } from '../../app/version/controller';
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
import { getSystemTime } from '@fastgpt/global/common/time/timezone';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';

// Evaluation target base class
export abstract class EvaluationTarget {
  abstract execute(input: TargetInput): Promise<TargetOutput>;
  abstract validate(): Promise<boolean>;
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
      getAppLatestVersion(appData._id, appData)
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
      retrievalContext: [], // TODO: Extract retrieval context from workflow results
      usage: flowUsages,
      responseTime: Date.now() - startTime
    };
  }

  async validate(): Promise<boolean> {
    try {
      const appData = await MongoApp.findById(this.config.appId);
      return !!appData;
    } catch (error) {
      return false;
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
    const isValid = await targetInstance.validate();

    return {
      success: isValid,
      message: isValid ? 'Target config is valid and accessible' : 'Target config validation failed'
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}
