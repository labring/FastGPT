import type { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { getNodeErrResponse, getHistories } from '../../utils';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ChatItemType
} from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  chats2GPTMessages,
  chatValue2RuntimePrompt,
  GPTMessages2Chats
} from '@fastgpt/global/core/chat/adapt';
import { filterMemoryMessages } from '../utils';
import { SubAppIds, systemSubInfo } from '@fastgpt/global/core/workflow/node/agent/constants';
import type { DispatchPlanAgentResponse } from './sub/plan';
import { dispatchPlanAgent } from './sub/plan';

import { formatFileInput } from './sub/file/utils';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { masterCall } from './master/call';
import { addLog } from '../../../../../common/system/log';
import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import { getSubapps } from './utils';
import { type AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import { getContinuePlanQuery, parseUserSystemPrompt } from './sub/plan/prompt';
import type { PlanAgentParamsType } from './sub/plan/constants';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';

export type DispatchAgentModuleProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.history]?: ChatItemType[];
  [NodeInputKeyEnum.userChatInput]: string;

  [NodeInputKeyEnum.fileUrlList]?: string[];
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]: string;

  [NodeInputKeyEnum.selectedTools]?: SkillToolType[];

  // Knowledge base search configuration
  [NodeInputKeyEnum.datasetParams]?: AppFormEditFormType['dataset'];
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
  const MAX_PLAN_ITERATIONS = 10; // 最大规划轮次

  let {
    checkIsStopping,
    node: { nodeId, inputs },
    lang,
    histories,
    query, // 最新一轮对话输入的值
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
      userChatInput, // 本次任务的输入
      history = 6,
      fileUrlList: fileLinks,
      agent_selectedTools: selectedTools = [],
      // Dataset search configuration
      agent_datasetParams: datasetParams
    }
  } = props;
  const chatHistories = getHistories(history, histories);
  const historiesMessages = chats2GPTMessages({
    messages: chatHistories,
    reserveId: false,
    reserveTool: true
  });

  let planIterationCount = 0; // 规划迭代计数器

  const masterMessagesKey = `masterMessages-${nodeId}`;
  const planMessagesKey = `planMessages-${nodeId}`;
  const agentPlanKey = `agentPlan-${nodeId}`;
  const planBufferKey = `planBuffer-${nodeId}`;

  // Get history messages

  const assistantResponses: AIChatItemValueItemType[] = [];
  const nodeResponses: ChatHistoryItemResType[] = [];

  try {
    // Get files
    const fileUrlInput = inputs.find((item) => item.key === NodeInputKeyEnum.fileUrlList);
    if (!fileUrlInput || !fileUrlInput.value || fileUrlInput.value.length === 0) {
      fileLinks = undefined;
    }
    const { filesMap, prompt: fileInputPrompt } = formatFileInput({
      fileUrls: fileLinks,
      requestOrigin,
      maxFiles: chatConfig?.fileSelectConfig?.maxFiles || 20,
      histories: chatHistories
    });

    // 交互模式进来的话，这个值才是交互输入的值
    const queryInput = chatValue2RuntimePrompt(query).text;
    const formatUserChatInput = fileInputPrompt
      ? `${fileInputPrompt}\n\n${userChatInput}`
      : userChatInput;

    let {
      masterMessages = historiesMessages.concat({
        role: 'user',
        content: formatUserChatInput
      }),
      planHistoryMessages,
      agentPlan,
      planBuffer
    } = (() => {
      const lastHistory = chatHistories[chatHistories.length - 1];
      if (lastHistory && lastHistory.obj === ChatRoleEnum.AI) {
        return {
          masterMessages: lastHistory.memories?.[masterMessagesKey] as ChatCompletionMessageParam[],
          planHistoryMessages: lastHistory.memories?.[
            planMessagesKey
          ] as ChatCompletionMessageParam[],
          agentPlan: lastHistory.memories?.[agentPlanKey] as AgentPlanType,
          planBuffer: lastHistory.memories?.[planBufferKey] as PlanAgentParamsType
        };
      }
      return {
        masterMessages: undefined,
        planHistoryMessages: undefined,
        agentPlan: undefined,
        planBuffer: undefined
      };
    })();

    // Get sub apps
    const { completionTools: agentCompletionTools, subAppsMap: agentSubAppsMap } = await getSubapps(
      {
        tools: selectedTools,
        tmbId: runningAppInfo.tmbId,
        lang,
        getPlanTool: true,
        hasDataset: datasetParams && datasetParams.datasets.length > 0,
        hasFiles: Object.keys(filesMap).length > 0
      }
    );
    const getSubAppInfo = (id: string) => {
      const formatId = id.slice(1);
      const toolNode =
        agentSubAppsMap.get(id) ||
        agentSubAppsMap.get(formatId) ||
        systemSubInfo[id] ||
        systemSubInfo[formatId];

      return {
        name: toolNode?.name || '',
        avatar: toolNode?.avatar || '',
        toolDescription: toolNode?.toolDescription || toolNode?.name || ''
      };
    };
    const getSubApp = (id: string) => {
      const formatId = id.slice(1);
      return (agentSubAppsMap.get(id) || agentSubAppsMap.get(formatId))!;
    };
    console.log(11111);
    console.dir(agentCompletionTools, { depth: null });
    console.dir(agentSubAppsMap, { depth: null });
    const formatedSystemPrompt = parseUserSystemPrompt({
      userSystemPrompt: systemPrompt,
      getSubAppInfo
    });

    /* ===== AI Start ===== */
    const parsePlanCallResult = (result: DispatchPlanAgentResponse) => {
      let { askInteractive, plan, planBuffer, completeMessages, usages, nodeResponse } = result;
      // 调试代码
      // if (plan) {
      //   plan.steps = plan.steps.slice(0, 1);
      // }
      nodeResponses.push(nodeResponse);
      usagePush(usages);

      // SSE response
      // 只有当 plan 存在且有步骤时才推送
      if (plan && plan.steps.length > 0) {
        const formatPlan = {
          ...plan,
          steps: plan.steps.map((item) => ({
            id: item.id,
            title: item.title,
            description: item.description
          }))
        };
        assistantResponses.push({
          plan: formatPlan
        });
        workflowStreamResponse?.({
          event: SseResponseEventEnum.plan,
          data: { plan: formatPlan }
        });
      }

      return {
        completeMessages,
        askInteractive,
        plan,
        planBuffer
      };
    };
    const planCallFn = async () => {
      // Plan: 2,4 场景
      if (!lastInteractive || !planHistoryMessages || !planBuffer) {
        addLog.error('Plan 结构逻辑错误');
        return Promise.reject('逻辑错误');
      }
      const result = await dispatchPlanAgent({
        checkIsStopping,
        completionTools: agentCompletionTools,
        getSubAppInfo,
        systemPrompt: formatedSystemPrompt,
        model,
        stream,

        mode: 'interactive', // 初始规划模式
        interactive: lastInteractive,
        planMessages: planHistoryMessages || [],
        queryInput,
        ...planBuffer
      });
      const { completeMessages, askInteractive, plan } = parsePlanCallResult(result);

      planHistoryMessages = undefined;
      agentPlan = plan;

      if (askInteractive) {
        return {
          [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
          [DispatchNodeResponseKeyEnum.memories]: {
            [masterMessagesKey]: masterMessages,
            [planMessagesKey]: filterMemoryMessages(completeMessages),
            [agentPlanKey]: agentPlan,
            [planBufferKey]: planBuffer
          },
          [DispatchNodeResponseKeyEnum.interactive]: askInteractive
        };
      }
    };
    const continuePlanCallFn = async () => {
      // plan: 5 场景
      if (!agentPlan) return;

      addLog.debug(`All steps completed, check if need continue planning`);
      const stepsResponse = agentPlan.steps.map((step) => {
        const stepResponse = assistantResponses
          .filter((item) => item.stepId === step.id)
          ?.map((item) => item.text?.content)
          .join('\n');
        return {
          title: step.title,
          response: stepResponse
        };
      });

      try {
        const result = await dispatchPlanAgent({
          checkIsStopping,
          completionTools: agentCompletionTools,
          getSubAppInfo,
          systemPrompt: formatedSystemPrompt,
          model,
          stream,
          mode: 'continue', // 继续规划模式
          query: getContinuePlanQuery({
            task: agentPlan.task,
            description: agentPlan.description,
            background: agentPlan.background,
            response: JSON.stringify(stepsResponse)
          }),
          task: agentPlan.task,
          description: agentPlan.description,
          background: agentPlan.background
        });

        const { plan: continuePlan } = parsePlanCallResult(result);

        if (continuePlan && continuePlan.steps.length > 0) {
          addLog.debug(
            `Continue planning: adding ${continuePlan.steps.length} new steps， ${continuePlan.steps.map((item) => item.title)}`
          );
          agentPlan.steps.push(...continuePlan.steps);
        } else {
          addLog.debug(`Continue planning: no new steps, planning complete`);
          agentPlan = undefined;
        }
      } catch (error) {
        addLog.error(`Continue planning failed`, error);
        // 规划失败时，清空 agentPlan，让任务正常结束
        agentPlan = undefined;
        return undefined;
      }
    };

    // 执行 Plan
    if (planHistoryMessages?.length) {
      const result = await planCallFn();
      // 有 result 代表 plan 有交互响应（ask）
      if (result) return result;
    }

    while (true) {
      if (checkIsStopping()) {
        break;
      }

      if (agentPlan) {
        while (!checkIsStopping() && agentPlan.steps.filter((item) => !item.response).length) {
          for await (const step of agentPlan.steps) {
            if (checkIsStopping()) {
              break;
            }
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
              systemPrompt: formatedSystemPrompt,
              masterMessages: [],
              planMessages: [],
              getSubAppInfo,
              getSubApp,
              completionTools: agentCompletionTools,
              steps: agentPlan.steps, // 传入所有步骤，而不仅仅是未执行的步骤
              step,
              filesMap
            });
            nodeResponses.push(result.nodeResponse);

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
        }

        if (checkIsStopping()) {
          break;
        }

        // 所有步骤执行完后，固定调用 Plan Agent（继续规划模式）
        const stepsResponse = agentPlan.steps.map((step) => {
          const stepResponse = assistantResponses
            .filter((item) => item.stepId === step.id)
            ?.map((item) => item.text?.content)
            .join('\n');
          return {
            title: step.title,
            response: stepResponse
          };
        });
        // 拼接 plan response 到 masterMessages 的 plan tool call 里（肯定在最后一个）
        const lastToolIndex = masterMessages.findLastIndex((item) => item.role === 'tool');
        if (lastToolIndex !== -1) {
          masterMessages[lastToolIndex].content = JSON.stringify(stepsResponse);
        }
        planIterationCount++;

        if (planIterationCount >= MAX_PLAN_ITERATIONS) {
          addLog.warn(`Max plan iteration reached: ${MAX_PLAN_ITERATIONS}, stopping`);
          agentPlan = undefined; // 强制结束规划
        } else {
          const continueResult = await continuePlanCallFn();

          // 如果有交互需求（Ask），直接返回
          if (continueResult) return continueResult;
        }

        // 如果 agentPlan 被清空（返回空步骤数组），说明规划完成，跳出 agentPlan 分支
        // 如果 agentPlan 有新步骤，继续循环执行
        if (!agentPlan) {
          addLog.debug(`Planning complete, hand over to master agent`);
          continue;
        }
      } else {
        addLog.debug(`Start master agent`);

        const result = await masterCall({
          ...props,
          masterMessages,
          planMessages: planHistoryMessages || [],
          systemPrompt: formatedSystemPrompt,
          getSubAppInfo,
          getSubApp,
          completionTools: agentCompletionTools,
          filesMap
        });
        nodeResponses.push(result.nodeResponse);
        masterMessages = result.masterMessages;

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
          const { completeMessages, askInteractive, plan, planBuffer } = parsePlanCallResult(
            result.planResponse
          );

          // 收集用户信息，结束调用，等待用户反馈
          if (askInteractive) {
            return {
              [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
              [DispatchNodeResponseKeyEnum.memories]: {
                [masterMessagesKey]: masterMessages,
                [planMessagesKey]: filterMemoryMessages(completeMessages),
                [agentPlanKey]: plan,
                [planBufferKey]: planBuffer
              },
              [DispatchNodeResponseKeyEnum.interactive]: askInteractive,
              [DispatchNodeResponseKeyEnum.nodeResponses]: nodeResponses
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
      [DispatchNodeResponseKeyEnum.memories]: {
        [masterMessagesKey]: undefined,
        [agentPlanKey]: undefined,
        [planMessagesKey]: undefined,
        [planBufferKey]: undefined
      },
      [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
      [DispatchNodeResponseKeyEnum.nodeResponses]: nodeResponses
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};
