import type { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  ConfirmPlanAgentText,
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { getNodeErrResponse, getHistories } from '../../utils';
import type { AIChatItemValueItemType, ChatItemType } from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  chats2GPTMessages,
  chatValue2RuntimePrompt,
  GPTMessages2Chats
} from '@fastgpt/global/core/chat/adapt';
import { filterMemoryMessages } from '../utils';
import { systemSubInfo } from './sub/constants';
import type { DispatchPlanAgentResponse } from './sub/plan';
import { dispatchPlanAgent, dispatchReplanAgent } from './sub/plan';

import { getFileInputPrompt } from './sub/file/utils';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { masterCall } from './master/call';
import { addLog } from '../../../../../common/system/log';
import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import { getSubapps } from './utils';
import { type AgentPlanType } from '@fastgpt/global/core/ai/agent/type';

export type DispatchAgentModuleProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.history]?: ChatItemType[];
  [NodeInputKeyEnum.userChatInput]: string;

  [NodeInputKeyEnum.fileUrlList]?: string[];
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]: string;
  [NodeInputKeyEnum.aiChatTemperature]?: number;
  [NodeInputKeyEnum.aiChatTopP]?: number;

  [NodeInputKeyEnum.selectedTools]?: SkillToolType[];
}>;

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
}>;

/* Agent 调度流程
  内置工具：文件解析、Plan 模式
  1. 主动工具 + 内置工具，如果触发 plan，则进行阶段调度模式。不触发，则相当于纯 toolcall 模式。
  2. 阶段调用模式：逐步完成任务，可以二次继续拆解任务。
*/

export const dispatchRunAgent = async (props: DispatchAgentModuleProps): Promise<Response> => {
  let {
    checkIsStopping,
    node: { nodeId, inputs },
    lang,
    histories,
    query,
    requestOrigin,
    chatConfig,
    lastInteractive,
    runningAppInfo,
    stream,
    workflowStreamResponse,
    usagePush,
    params: {
      model,
      systemPrompt,
      userChatInput,
      history = 6,
      fileUrlList: fileLinks,
      temperature,
      aiChatTopP,
      agent_selectedTools: selectedTools = []
    }
  } = props;
  const chatHistories = getHistories(history, histories);
  const historiesMessages = chats2GPTMessages({
    messages: chatHistories,
    reserveId: false,
    reserveTool: true
  });

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
        planHistoryMessages: lastHistory.memories?.[
          planMessagesKey
        ] as ChatCompletionMessageParam[],
        replanMessages: lastHistory.memories?.[replanMessagesKey] as ChatCompletionMessageParam[],
        agentPlan: lastHistory.memories?.[agentPlanKey] as AgentPlanType
      };
    }
    return {
      planHistoryMessages: undefined,
      replanMessages: undefined,
      agentPlan: undefined
    };
  })();
  const assistantResponses: AIChatItemValueItemType[] = [];

  // agentPlan = {
  //   task: '撰写 dify 和 fastgpt 两个产品的功能和价格对比报告',
  //   steps: [
  //     {
  //       id: 'step1',
  //       title: '收集 dify 产品的功能和价格信息',
  //       description: '使用 @秘塔搜索 搜索 dify 产品的官方信息、功能介绍和价格方案，整理关键信息'
  //     }
  //   ],
  //   replan: false
  // };

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
    const { completionTools: agentCompletionTools, subAppsMap: agentSubAppsMap } = await getSubapps(
      {
        tools: selectedTools,
        tmbId: runningAppInfo.tmbId,
        lang,
        filesMap,
        getPlanTool: true
      }
    );
    const getSubAppInfo = (id: string) => {
      const toolNode = agentSubAppsMap.get(id) || systemSubInfo[id];
      return {
        name: toolNode?.name || '',
        avatar: toolNode?.avatar || '',
        toolDescription: toolNode?.toolDescription || toolNode?.name || ''
      };
    };
    // console.log(JSON.stringify(agentCompletionTools, null, 2), 'topAgent completionTools');
    // console.log(agentSubAppsMap, 'topAgent subAppsMap');

    /* ===== AI Start ===== */
    const parsePlanCallResult = (result: DispatchPlanAgentResponse) => {
      let { askInteractive, plan, completeMessages, usages } = result;
      // 调试代码
      // if (plan) {
      //   plan.steps = plan.steps.slice(0, 1);
      // }
      usagePush(usages);

      // SSE response
      if (plan) {
        assistantResponses.push({
          plan: {
            ...plan,
            steps: plan.steps.map((item) => ({
              id: item.id,
              title: item.title,
              description: item.description
            }))
          }
        });
        workflowStreamResponse?.({
          event: SseResponseEventEnum.plan,
          data: { plan }
        });
      }

      return {
        completeMessages,
        askInteractive,
        plan
      };
    };
    const planCallFn = async () => {
      // 点了确认。此时肯定有 agentPlans
      if (
        lastInteractive?.type === 'agentPlanCheck' &&
        interactiveInput === ConfirmPlanAgentText &&
        agentPlan
      ) {
        planHistoryMessages = undefined;
      } else {
        const result = await dispatchPlanAgent({
          checkIsStopping,
          historyMessages: planHistoryMessages || historiesMessages,
          userInput: lastInteractive ? interactiveInput : userChatInput,
          interactive: lastInteractive,
          completionTools: agentCompletionTools,
          getSubAppInfo,
          systemPrompt: systemPrompt,
          model,
          temperature,
          top_p: aiChatTopP,
          stream
        });
        const { completeMessages, askInteractive, plan } = parsePlanCallResult(result);

        planHistoryMessages = undefined;
        agentPlan = plan;

        if (askInteractive) {
          return {
            [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
            [DispatchNodeResponseKeyEnum.memories]: {
              [planMessagesKey]: filterMemoryMessages(completeMessages),
              [agentPlanKey]: agentPlan
            },
            [DispatchNodeResponseKeyEnum.interactive]: askInteractive
          };
        }
      }
    };
    const replanCallFn = async ({ plan }: { plan: AgentPlanType }) => {
      if (!agentPlan) return;

      addLog.debug(`Replan step`);

      const result = await dispatchReplanAgent({
        checkIsStopping,
        historyMessages: replanMessages || historiesMessages,
        userInput: lastInteractive ? interactiveInput : userChatInput,
        plan,
        interactive: lastInteractive,
        completionTools: agentCompletionTools,
        getSubAppInfo,
        systemPrompt,
        model,
        temperature,
        top_p: aiChatTopP,
        stream
      });
      const { completeMessages, askInteractive, plan: replan } = parsePlanCallResult(result);

      replanMessages = undefined;
      if (replan) {
        agentPlan.steps.push(...replan.steps);
        agentPlan.replan = replan.replan;
      }

      // Sub agent plan 不会有交互响应。Top agent plan 肯定会有。
      if (askInteractive) {
        return {
          [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
          [DispatchNodeResponseKeyEnum.memories]: {
            [replanMessagesKey]: filterMemoryMessages(completeMessages),
            [agentPlanKey]: agentPlan
          },
          [DispatchNodeResponseKeyEnum.interactive]: askInteractive
        };
      }
    };

    // 执行 Plan/replan
    if (!!planHistoryMessages?.length) {
      const result = await planCallFn();
      // 有 result 代表 plan 有交互响应（check/ask）
      if (result) return result;
    } else if (agentPlan && !!replanMessages?.length) {
      const result = await replanCallFn({
        plan: agentPlan
      });
      if (result) return result;
    }

    while (true) {
      if (agentPlan) {
        addLog.debug(`Start step call`, {
          agentPlan: JSON.stringify(agentPlan, null, 2)
        });

        while (agentPlan.steps.filter((item) => !item.response).length) {
          for await (const step of agentPlan.steps) {
            if (step.response) continue;
            addLog.debug(`Step call: ${step.id}`, step);
            assistantResponses.push({
              stepTitle: {
                stepId: step.id,
                title: step.title
              }
            });
            workflowStreamResponse?.({
              event: SseResponseEventEnum.stepTitle,
              data: {
                stepTitle: {
                  stepId: step.id,
                  title: step.title
                }
              }
            });

            // Step call
            const result = await masterCall({
              ...props,
              historiesMessages: [],
              getSubAppInfo,
              completionTools: agentCompletionTools,
              steps: agentPlan.steps, // 传入所有步骤，而不仅仅是未执行的步骤
              step,
              filesMap,
              subAppsMap: agentSubAppsMap
            });

            // Merge response
            const assistantResponse = GPTMessages2Chats({
              messages: result.assistantMessages,
              reserveTool: true,
              getToolInfo: getSubAppInfo
            })
              .map((item) => item.value)
              .flat()
              .map((item) => ({
                ...item,
                stepId: step.id
              }));
            assistantResponses.push(...assistantResponse);

            step.response = result.stepResponse?.rawResponse;
            step.summary = result.stepResponse?.summary;
          }

          // Call replan
          if (agentPlan.replan === true) {
            // 内部会修改 agentPlan.steps 的内容，从而使循环重复触发
            const replanResult = await replanCallFn({
              plan: agentPlan
            });
            // Replan 里有需要用户交互的内容，直接 return
            if (replanResult) return replanResult;
          }
        }

        // Step call 执行完，交给 master agent 继续执行
        agentPlan = undefined;
        continue;
      } else {
        addLog.debug(`Start master agent`);
        const messages = chats2GPTMessages({
          messages: [{ obj: ChatRoleEnum.AI, value: assistantResponses }],
          reserveId: false,
          reserveTool: true
        });
        const result = await masterCall({
          ...props,
          historiesMessages: [...historiesMessages, ...messages],
          getSubAppInfo,
          completionTools: agentCompletionTools,
          filesMap,
          subAppsMap: agentSubAppsMap
        });

        // Merge assistant responses
        const assistantResponse = GPTMessages2Chats({
          messages: result.assistantMessages,
          reserveTool: true,
          getToolInfo: getSubAppInfo
        })
          .map((item) => item.value as AIChatItemValueItemType[])
          .flat();
        assistantResponses.push(...assistantResponse);

        // 触发了 plan
        if (result.planResponse) {
          const { completeMessages, askInteractive, plan } = parsePlanCallResult(
            result.planResponse
          );

          // 收集用户信息，结束调用，等待用户反馈
          if (askInteractive) {
            return {
              [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
              [DispatchNodeResponseKeyEnum.memories]: {
                [planMessagesKey]: filterMemoryMessages(completeMessages),
                [agentPlanKey]: plan
              },
              [DispatchNodeResponseKeyEnum.interactive]: askInteractive
            };
          }

          // 生成了 plan，进入 stepCall 模式
          if (plan) {
            agentPlan = plan;
            continue;
          }
          break;
        }

        // 没有触发 plan，也就是最基本的工具调用。直接结束任务。
        break;
      }
    }

    // 任务结束
    return {
      // 目前 Master 不会触发交互
      // [DispatchNodeResponseKeyEnum.interactive]: interactiveResponse,
      // TODO: 需要对 memoryMessages 单独建表存储
      [DispatchNodeResponseKeyEnum.memories]: {
        [agentPlanKey]: undefined,
        [planMessagesKey]: undefined,
        [replanMessagesKey]: undefined
      },
      [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        // 展示的积分消耗
        // totalPoints: totalPointsUsage,
        // toolCallInputTokens: inputTokens,
        // toolCallOutputTokens: outputTokens,
        // childTotalPoints: toolTotalPoints,
        // model: modelName,
        query: userChatInput,
        // toolDetail: dispatchFlowResponse,
        mergeSignId: nodeId
      }
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};
