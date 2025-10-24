import type { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  ConfirmPlanAgentText,
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  DispatchNodeResultType,
  ModuleDispatchProps,
  RuntimeNodeItemType
} from '@fastgpt/global/core/workflow/runtime/type';
import { getLLMModel } from '../../../../ai/model';
import { getNodeErrResponse, getHistories } from '../../utils';
import type { AIChatItemValueItemType, ChatItemType } from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { formatModelChars2Points } from '../../../../../support/wallet/usage/utils';
import { filterMemoryMessages } from '../utils';
import { systemSubInfo } from './sub/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { dispatchPlanAgent, dispatchReplanAgent } from './sub/plan';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import { getSubApps, rewriteSubAppsToolset } from './sub';

import { getFileInputPrompt } from './sub/file/utils';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import type { AgentPlanType } from './sub/plan/type';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { stepCall } from './master/call';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { addLog } from '../../../../../common/system/log';

export type DispatchAgentModuleProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.history]?: ChatItemType[];
  [NodeInputKeyEnum.userChatInput]: string;

  [NodeInputKeyEnum.fileUrlList]?: string[];
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]: string;
  [NodeInputKeyEnum.aiChatTemperature]?: number;
  [NodeInputKeyEnum.aiChatTopP]?: number;

  [NodeInputKeyEnum.subApps]?: FlowNodeTemplateType[];
  [NodeInputKeyEnum.isAskAgent]?: boolean;
  [NodeInputKeyEnum.isPlanAgent]?: boolean;
}>;

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
}>;

export const dispatchRunAgent = async (props: DispatchAgentModuleProps): Promise<Response> => {
  let {
    node: { nodeId, name, isEntry, version, inputs },
    lang,
    runtimeNodes,
    histories,
    query,
    requestOrigin,
    chatConfig,
    lastInteractive,
    runningUserInfo,
    runningAppInfo,
    variables,
    externalProvider,
    usageId,
    stream,
    res,
    workflowDispatchDeep,
    workflowStreamResponse,
    params: {
      model,
      systemPrompt,
      userChatInput,
      history = 6,
      fileUrlList: fileLinks,
      temperature,
      aiChatTopP,
      subApps = [],
      isPlanAgent = true,
      isAskAgent = true
    }
  } = props;
  const agentModel = getLLMModel(model);
  const chatHistories = getHistories(history, histories);
  console.log('userChatInput', userChatInput);
  const planMessagesKey = `planMessages-${nodeId}`;
  const replanMessagesKey = `replanMessages-${nodeId}`;
  const agentPlanKey = `agentPlan-${nodeId}`;

  // 交互模式进来的话，这个值才是交互输入的值
  const interactiveInput = lastInteractive ? chatValue2RuntimePrompt(query).text : '';

  // Get history messages
  let { planHistoryMessages, replanMessages, agentPlan } = (() => {
    const lastHistory = chatHistories[chatHistories.length - 1];
    if (lastHistory && lastHistory.obj === ChatRoleEnum.AI) {
      return {
        planHistoryMessages: (lastHistory.memories?.[planMessagesKey] ||
          []) as ChatCompletionMessageParam[],
        replanMessages: (lastHistory.memories?.[replanMessagesKey] ||
          []) as ChatCompletionMessageParam[],
        agentPlan: (lastHistory.memories?.[agentPlanKey] || []) as AgentPlanType
      };
    }
    return {
      planHistoryMessages: undefined,
      replanMessages: undefined,
      agentPlan: undefined
    };
  })();

  // Plan step: 需要生成 plan，且还没有完整的 plan
  const isPlanStep = isPlanAgent && (planHistoryMessages || !agentPlan);
  // Replan step: 已有 plan，且有 replan 历史消息
  const isReplanStep = isPlanAgent && agentPlan && replanMessages;

  try {
    // Get files
    const fileUrlInput = inputs.find((item) => item.key === NodeInputKeyEnum.fileUrlList);
    if (!fileUrlInput || !fileUrlInput.value || fileUrlInput.value.length === 0) {
      fileLinks = undefined;
    }
    const { filesMap, prompt: fileInputPrompt } = getFileInputPrompt({
      fileUrls: fileLinks,
      requestOrigin,
      maxFiles: chatConfig?.fileSelectConfig?.maxFiles || 20,
      histories: chatHistories
    });

    // Get sub apps
    const { subAppList, subAppsMap, getSubAppInfo } = await useSubApps({
      subApps,
      lang,
      filesMap
    });

    const planCallFn = async () => {
      // Confirm 操作
      console.log(lastInteractive, interactiveInput, '\n Plan step');
      if (lastInteractive?.type === 'agentPlanCheck' && interactiveInput === ConfirmPlanAgentText) {
        planHistoryMessages = undefined;
      } else {
        // 临时代码
        const tmpText = '正在进行规划生成...\n';
        workflowStreamResponse?.({
          event: SseResponseEventEnum.answer,
          data: textAdaptGptResponse({
            text: tmpText
          })
        });

        const { answerText, plan, completeMessages, usages, interactiveResponse } =
          await dispatchPlanAgent({
            historyMessages: planHistoryMessages || [],
            userInput: lastInteractive ? interactiveInput : userChatInput,
            interactive: lastInteractive,
            subAppList,
            getSubAppInfo,
            systemPrompt,
            model,
            temperature,
            top_p: aiChatTopP,
            stream,
            isTopPlanAgent: workflowDispatchDeep === 1
          });

        const text = `${answerText}${plan ? `\n\`\`\`json\n${JSON.stringify(plan, null, 2)}\n\`\`\`` : ''}`;
        workflowStreamResponse?.({
          event: SseResponseEventEnum.answer,
          data: textAdaptGptResponse({
            text
          })
        });

        agentPlan = plan;

        // TODO: usage 合并
        // Sub agent plan 不会有交互响应。Top agent plan 肯定会有。
        if (interactiveResponse) {
          return {
            [DispatchNodeResponseKeyEnum.answerText]: `${tmpText}${text}`,
            [DispatchNodeResponseKeyEnum.memories]: {
              [planMessagesKey]: filterMemoryMessages(completeMessages),
              [agentPlanKey]: agentPlan
            },
            [DispatchNodeResponseKeyEnum.interactive]: interactiveResponse
          };
        } else {
          planHistoryMessages = undefined;
        }
      }
    };
    const replanCallFn = async ({ plan }: { plan: AgentPlanType }) => {
      if (!agentPlan) return;

      addLog.debug(`Replan step`);
      // 临时代码
      const tmpText = '\n正在重新进行规划生成...\n';
      workflowStreamResponse?.({
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text: tmpText
        })
      });

      const {
        answerText,
        plan: rePlan,
        completeMessages,
        usages,
        interactiveResponse
      } = await dispatchReplanAgent({
        historyMessages: replanMessages || [],
        userInput: lastInteractive ? interactiveInput : userChatInput,
        plan,
        interactive: lastInteractive,
        subAppList,
        getSubAppInfo,
        systemPrompt,
        model,
        temperature,
        top_p: aiChatTopP,
        stream,
        isTopPlanAgent: workflowDispatchDeep === 1
      });

      if (rePlan) {
        agentPlan.steps.push(...rePlan.steps);
        agentPlan.replan = rePlan.replan;
      }

      const text = `${answerText}${agentPlan ? `\n\`\`\`json\n${JSON.stringify(agentPlan, null, 2)}\n\`\`\`\n` : ''}`;
      workflowStreamResponse?.({
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text
        })
      });

      // TODO: usage 合并
      // Sub agent plan 不会有交互响应。Top agent plan 肯定会有。
      if (interactiveResponse) {
        return {
          [DispatchNodeResponseKeyEnum.answerText]: `${tmpText}${text}`,
          [DispatchNodeResponseKeyEnum.memories]: {
            [planMessagesKey]: filterMemoryMessages(completeMessages),
            [agentPlanKey]: agentPlan
          },
          [DispatchNodeResponseKeyEnum.interactive]: interactiveResponse
        };
      } else {
        replanMessages = undefined;
      }
    };

    /* ===== Plan Agent ===== */
    if (isPlanStep) {
      const result = await planCallFn();
      if (result) return result;
    } else if (isReplanStep) {
      const result = await replanCallFn({
        plan: agentPlan!
      });
      if (result) return result;
    }

    addLog.debug(`Start master agent`, {
      agentPlan: JSON.stringify(agentPlan, null, 2)
    });

    /* ===== Master agent, 逐步执行 plan ===== */
    if (agentPlan) {
      let [inputTokens, outputTokens, subAppUsages, assistantResponses]: [
        number,
        number,
        ChatNodeUsageType[],
        AIChatItemValueItemType[]
      ] = [0, 0, [], []];

      while (agentPlan?.steps!.filter((item) => !item.response)!.length) {
        const steps = agentPlan?.steps!.filter((item) => !item.response)!;
        for await (const step of steps) {
          addLog.debug(`Step call: ${step.id}`, step);

          workflowStreamResponse?.({
            event: SseResponseEventEnum.answer,
            data: textAdaptGptResponse({
              text: `# 步骤: ${step.title}\n`
            })
          });

          const result = await stepCall({
            ...props,
            getSubAppInfo,
            steps,
            subAppList,
            step,
            filesMap,
            subAppsMap
          });

          step.response = result.rawResponse;
          step.summary = result.summary;
          inputTokens += result.inputTokens;
          outputTokens += result.outputTokens;
          subAppUsages.push(...result.subAppUsages);
          assistantResponses.push(...result.assistantResponses);
        }

        if (agentPlan?.replan && agentPlan?.replan.length > 0) {
          const replanResult = await replanCallFn({
            plan: agentPlan
          });
          if (replanResult) return replanResult;
        }
      }
      console.log(agentPlan, 'agentPlan');
      // Usage count
      const { totalPoints: modelTotalPoints, modelName } = formatModelChars2Points({
        model,
        inputTokens,
        outputTokens
      });
      const modelUsage = externalProvider.openaiAccount?.key ? 0 : modelTotalPoints;
      const toolTotalPoints = subAppUsages.reduce((sum, item) => sum + item.totalPoints, 0);
      // concat tool usage
      const totalPointsUsage = modelUsage + toolTotalPoints;

      return {
        // 目前 Master 不会触发交互
        // [DispatchNodeResponseKeyEnum.interactive]: interactiveResponse,
        // TODO: 需要对 memoryMessages 单独建表存储
        [DispatchNodeResponseKeyEnum.memories]: {
          [agentPlanKey]: agentPlan
        },
        [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          // 展示的积分消耗
          totalPoints: totalPointsUsage,
          toolCallInputTokens: inputTokens,
          toolCallOutputTokens: outputTokens,
          childTotalPoints: toolTotalPoints,
          model: modelName,
          query: userChatInput,
          // toolDetail: dispatchFlowResponse,
          mergeSignId: nodeId
        },
        [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
          // Model usage
          {
            moduleName: name,
            model: modelName,
            totalPoints: modelUsage,
            inputTokens: inputTokens,
            outputTokens: outputTokens
          },
          // Tool usage
          ...subAppUsages
        ]
      };
    } else {
      // TODO: 没有 plan
      console.log('没有 plan');

      return {
        // 目前 Master 不会触发交互
        // [DispatchNodeResponseKeyEnum.interactive]: interactiveResponse,
        // TODO: 需要对 memoryMessages 单独建表存储
        [DispatchNodeResponseKeyEnum.memories]: {
          [agentPlanKey]: agentPlan
        },
        [DispatchNodeResponseKeyEnum.nodeResponse]: {},
        [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: []
      };
    }
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};

export const useSubApps = async ({
  subApps,
  lang,
  filesMap
}: {
  subApps: FlowNodeTemplateType[];
  lang?: localeType;
  filesMap: Record<string, string>;
}) => {
  // Get sub apps
  const runtimeSubApps = await rewriteSubAppsToolset({
    subApps: subApps.map<RuntimeNodeItemType>((node) => {
      return {
        nodeId: node.id,
        name: node.name,
        avatar: node.avatar,
        intro: node.intro,
        toolDescription: node.toolDescription,
        flowNodeType: node.flowNodeType,
        showStatus: node.showStatus,
        isEntry: false,
        inputs: node.inputs,
        outputs: node.outputs,
        pluginId: node.pluginId,
        version: node.version,
        toolConfig: node.toolConfig,
        catchError: node.catchError
      };
    }),
    lang
  });

  const subAppList = getSubApps({
    subApps: runtimeSubApps,
    addReadFileTool: Object.keys(filesMap).length > 0
  });

  const subAppsMap = new Map(runtimeSubApps.map((item) => [item.nodeId, item]));
  const getSubAppInfo = (id: string) => {
    const toolNode = subAppsMap.get(id) || systemSubInfo[id];
    return {
      name: toolNode?.name || '',
      avatar: toolNode?.avatar || '',
      toolDescription: toolNode?.toolDescription || toolNode?.name || ''
    };
  };

  return {
    subAppList,
    subAppsMap,
    getSubAppInfo
  };
};
