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
import { createLLMResponse } from '../../../../ai/llm/request';
import { parseToolArgs } from '../utils';

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
      const tmpText = '\n # 正在重新进行规划生成...\n';
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

    /**
     * 检测问题复杂度
     * @returns true: 复杂问题，需要正常规划流程; false: 简单问题，已构造简单 plan
     */
    const checkQuestionComplexity = async (): Promise<boolean> => {
      addLog.debug('Checking if question is simple...');

      const simpleCheckPrompt = `你是一位资深的认知复杂度评估专家 (Cognitive Complexity Assessment Specialist)。 您的职责是对用户提出的任务请求进行深度解析，精准判断其内在的认知复杂度层级，并据此决定是否需要启动多步骤规划流程。
      
用户显式意图 (User Explicit Intent):
用户可能会在问题中明确表达其期望的回答方式或处理深度。 常见的意图类型包括：
*   **快速回答 / 简单回答 (Quick/Simple Answer)**：用户期望得到简洁、直接的答案，无需深入分析或详细解释。 例如：“请简单回答...”、“快速告诉我...”
*   **深度思考 / 详细分析 (Deep Thinking/Detailed Analysis)**：用户期望得到深入、全面的分析，包括多角度的思考、证据支持和详细的解释。 例如：“请深入分析...”、“详细解释...”
*   **创造性方案 / 创新性建议 (Creative Solution/Innovative Suggestion)**：用户期望得到具有创新性的解决方案或建议，可能需要进行发散性思维和方案设计。 例如：“请提出一个创新的方案...”、“提供一些有创意的建议...”
*   **无明确意图 (No Explicit Intent)**：用户没有明确表达其期望的回答方式或处理深度。

评估框架 (Assessment Framework):
*   **低复杂度任务 (Low Complexity - \`complex: false\`)**: 此类任务具备高度的直接性和明确性，通常仅需调用单一工具或执行简单的操作即可完成。 其特征包括：
    *   **直接工具可解性 (Direct Tool Solvability)**：任务目标明确，可直接映射到特定的工具功能。
    *   **信息可得性 (Information Accessibility)**：所需信息易于获取，无需复杂的搜索或推理。
    *   **操作单一性 (Operational Singularity)**：任务执行路径清晰，无需多步骤协同。
    *   **典型示例 (Typical Examples)**：信息检索 (Information Retrieval)、简单算术计算 (Simple Arithmetic Calculation)、事实性问题解答 (Factual Question Answering)、目标明确的单一指令执行 (Single, Well-Defined Instruction Execution)。
*   **高复杂度任务 (High Complexity - \'complex: true\')**: 此类任务涉及复杂的认知过程，需要进行多步骤规划、工具组合、深入分析和创造性思考才能完成。 其特征包括：
    *   **意图模糊性 (Intent Ambiguity)**：用户意图不明确，需要进行意图消歧 (Intent Disambiguation) 或目标细化 (Goal Refinement)。
    *   **信息聚合需求 (Information Aggregation Requirement)**：需要整合来自多个信息源的数据，进行综合分析。
    *   **推理与判断 (Reasoning and Judgement)**：需要进行逻辑推理、情境分析、价值判断等认知操作。
    *   **创造性与探索性 (Creativity and Exploration)**：需要进行发散性思维、方案设计、假设验证等探索性活动。
    *   **
    *   **典型示例 (Typical Examples)**：意图不明确的请求 (Ambiguous Requests)、需要综合多个信息源的任务 (Tasks Requiring Information Synthesis from Multiple Sources)、需要复杂推理或创造性思考的问题 (Problems Requiring Complex Reasoning or Creative Thinking)。
待评估用户问题 (User Query): ${userChatInput}

输出规范 (Output Specification):
请严格遵循以下 JSON 格式输出您的评估结果：
\`\`\`json
{
  "complex": true/false,
  "reason": "对任务认知复杂度的详细解释，说明判断的理由，并引用上述评估框架中的相关概念。"
}
\`\`\`

`;

      try {
        const { answerText: checkResult } = await createLLMResponse({
          body: {
            model: agentModel.model,
            temperature: 0.1,
            messages: [
              {
                role: 'system',
                content: '你是一个任务复杂度判断专家，只需要输出 JSON 格式的判断结果。'
              },
              {
                role: 'user',
                content: simpleCheckPrompt
              }
            ]
          }
        });

        const checkResponse = parseToolArgs<{ complex: boolean; reason: string }>(checkResult);

        if (checkResponse && !checkResponse.complex) {
          // 构造一个简单的 plan，包含一个直接回答的 step
          agentPlan = {
            task: userChatInput,
            steps: [
              {
                id: 'Simple-Answer',
                title: '回答问题',
                description: `直接回答用户问题：${userChatInput}`,
                response: undefined
              }
            ],
            replan: false
          };

          workflowStreamResponse?.({
            event: SseResponseEventEnum.answer,
            data: textAdaptGptResponse({
              text: `检测到简单问题，直接回答中...\n`
            })
          });

          return false; // 简单问题
        } else {
          return true; // 复杂问题
        }
      } catch (error) {
        addLog.error('Simple question check failed, proceeding with normal plan flow', error);
        return true; // 出错时默认走复杂流程
      }
    };

    /* ===== Plan Agent ===== */
    if (isPlanStep) {
      const isComplex = await checkQuestionComplexity();
      if (isComplex) {
        const result = await planCallFn();
        if (result) return result;
      }
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
        const pendingSteps = agentPlan?.steps!.filter((item) => !item.response)!;
        for await (const step of pendingSteps) {
          addLog.debug(`Step call: ${step.id}`, step);

          workflowStreamResponse?.({
            event: SseResponseEventEnum.answer,
            data: textAdaptGptResponse({
              text: `\n # ${step.id}: ${step.title}\n`
            })
          });

          const result = await stepCall({
            ...props,
            getSubAppInfo,
            steps: agentPlan.steps, // 传入所有步骤，而不仅仅是未执行的步骤
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

        if (agentPlan?.replan === true) {
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
