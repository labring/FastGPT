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
import {
  chats2GPTMessages,
  chatValue2RuntimePrompt,
  GPTMessages2Chats
} from '@fastgpt/global/core/chat/adapt';
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
import { checkTaskComplexity } from './master/taskComplexity';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { matchSkillForPlan } from './skillMatcher';

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
    externalProvider,
    stream,
    workflowDispatchDeep,
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
      subApps = [],
      isPlanAgent = true,
      isAskAgent = true
    }
  } = props;
  const agentModel = getLLMModel(model);
  const chatHistories = getHistories(history, histories);
  const historiesMessages = chats2GPTMessages({
    messages: chatHistories,
    reserveId: false,
    reserveTool: false
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

    /* ===== AI Start ===== */

    /* ===== Check task complexity ===== */
    const taskIsComplexity = await (async () => {
      // Check task complexity: 第一次进入任务时候进行判断。（有 plan了，说明已经开始执行任务了）
      const isCheckTaskComplexityStep = isPlanAgent && !agentPlan && !planHistoryMessages;
      // if (isCheckTaskComplexityStep) {
      //   const res = await checkTaskComplexity({
      //     model,
      //     userChatInput
      //   });
      //   if (res.usage) {
      //     usagePush([res.usage]);
      //   }
      //   return res.complex;
      // }

      // 对轮运行时候，代表都是进入复杂流程
      return true;
    })();

    if (taskIsComplexity) {
      /* ===== Plan Agent ===== */
      const planCallFn = async (referencePlanSystemPrompt?: string) => {
        // 点了确认。此时肯定有 agentPlans
        if (
          lastInteractive?.type === 'agentPlanCheck' &&
          interactiveInput === ConfirmPlanAgentText &&
          agentPlan
        ) {
          planHistoryMessages = undefined;
        } else {
          const { answerText, plan, completeMessages, usages, interactiveResponse } =
            await dispatchPlanAgent({
              historyMessages: planHistoryMessages || historiesMessages,
              userInput: lastInteractive ? interactiveInput : userChatInput,
              interactive: lastInteractive,
              subAppList,
              getSubAppInfo,
              systemPrompt: referencePlanSystemPrompt || systemPrompt,
              model,
              temperature,
              top_p: aiChatTopP,
              stream,
              isTopPlanAgent: workflowDispatchDeep === 1
            });

          const assistantResponses: AIChatItemValueItemType[] = [
            ...(answerText
              ? [
                  {
                    text: {
                      content: answerText
                    }
                  }
                ]
              : []),
            ...(plan
              ? [
                  {
                    agentPlan: {
                      replan: false,
                      steps: plan.steps.map((step) => {
                        return {
                          id: step.id,
                          title: step.title,
                          description: step.description,
                          status: 'pending' as const,
                          value: []
                        };
                      })
                    }
                  }
                ]
              : [])
          ];

          // SSE response
          if (answerText) {
            workflowStreamResponse?.({
              event: SseResponseEventEnum.answer,
              data: textAdaptGptResponse({
                text: answerText
              })
            });
          }
          if (plan) {
            workflowStreamResponse?.({
              event: SseResponseEventEnum.agentPlan,
              data: { agentPlan: plan }
            });
          }

          agentPlan = plan;

          usagePush(usages);
          // Sub agent plan 不会有交互响应。Top agent plan 肯定会有。
          if (interactiveResponse) {
            return {
              [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
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

        const {
          answerText,
          plan: rePlan,
          completeMessages,
          usages,
          interactiveResponse
        } = await dispatchReplanAgent({
          historyMessages: replanMessages || historiesMessages,
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

        const assistantResponses: AIChatItemValueItemType[] = [
          ...(answerText
            ? [
                {
                  text: {
                    content: answerText
                  }
                }
              ]
            : []),
          ...(rePlan
            ? [
                {
                  agentPlan: {
                    replan: false,
                    steps: plan.steps.map((step) => {
                      return {
                        id: step.id,
                        title: step.title,
                        description: step.description,
                        status: 'pending' as const,
                        value: []
                      };
                    })
                  }
                }
              ]
            : [])
        ];

        // SSE response
        if (answerText) {
          workflowStreamResponse?.({
            event: SseResponseEventEnum.answer,
            data: textAdaptGptResponse({
              text: answerText
            })
          });
        }
        if (rePlan) {
          workflowStreamResponse?.({
            event: SseResponseEventEnum.agentPlan,
            data: { agentPlan: plan }
          });
        }

        usagePush(usages);
        // Sub agent plan 不会有交互响应。Top agent plan 肯定会有。
        if (interactiveResponse) {
          return {
            [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
            [DispatchNodeResponseKeyEnum.memories]: {
              [replanMessagesKey]: filterMemoryMessages(completeMessages),
              [agentPlanKey]: agentPlan
            },
            [DispatchNodeResponseKeyEnum.interactive]: interactiveResponse
          };
        } else {
          replanMessages = undefined;
        }
      };

      // Plan step: 需要生成 plan，且还没有完整的 plan
      const isPlanStep = isPlanAgent && (!agentPlan || planHistoryMessages);
      // Replan step: 已有 plan，且有 replan 历史消息
      const isReplanStep = isPlanAgent && agentPlan && replanMessages;

      // 🆕 执行 Skill 匹配（仅在 isPlanStep 且没有 planHistoryMessages 时）
      let matchedSkillSystemPrompt: string | undefined;

      console.log('planHistoryMessages', planHistoryMessages);
      // 执行 Plan/replan
      if (isPlanStep) {
        // match skill
        addLog.debug('尝试匹配用户的历史 skills');
        const matchResult = await matchSkillForPlan({
          teamId: runningUserInfo.teamId,
          appId: runningAppInfo.id,
          userInput: lastInteractive ? interactiveInput : userChatInput,
          model
        });
        if (matchResult.matched && matchResult.systemPrompt) {
          addLog.debug(`匹配到 skill: ${matchResult.skill?.name}`);
          matchedSkillSystemPrompt = matchResult.systemPrompt;

          // 可选: 推送匹配信息给前端
          workflowStreamResponse?.({
            event: SseResponseEventEnum.answer,
            data: textAdaptGptResponse({
              text: `📋 找到参考技能: ${matchResult.systemPrompt}`
            })
          });
        } else {
          addLog.debug(`未匹配到 skill，原因: ${matchResult.reason}`);
        }

        const result = await planCallFn(matchedSkillSystemPrompt);
        // 有 result 代表 plan 有交互响应（check/ask）
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
      if (!agentPlan) return Promise.reject('没有 plan');

      const assistantResponses: AIChatItemValueItemType[] = [];

      while (agentPlan.steps!.filter((item) => !item.response)!.length) {
        for await (const step of agentPlan?.steps) {
          if (step.response) continue;
          addLog.debug(`Step call: ${step.id}`, step);

          // Step call
          const result = await stepCall({
            ...props,
            getSubAppInfo,
            steps: agentPlan.steps, // 传入所有步骤，而不仅仅是未执行的步骤
            subAppList,
            step,
            filesMap,
            subAppsMap
          });

          // Merge response
          const assistantResponse = GPTMessages2Chats({
            messages: result.assistantMessages,
            reserveTool: true,
            getToolInfo: getSubAppInfo
          })
            .map((item) => item.value as AIChatItemValueItemType[])
            .flat();
          step.response = result.rawResponse;
          step.summary = result.summary;
          assistantResponses.push(
            ...assistantResponse.map((item) => ({
              ...item,
              stepId: step.id
            }))
          );
        }

        // Call replan
        if (agentPlan?.replan === true) {
          // 内部会修改 agentPlan.steps 的内容，从而使循环重复触发
          const replanResult = await replanCallFn({
            plan: agentPlan
          });
          // Replan 里有需要用户交互的内容，直接 return
          if (replanResult) return replanResult;
        }
      }

      return {
        // 目前 Master 不会触发交互
        // [DispatchNodeResponseKeyEnum.interactive]: interactiveResponse,
        // TODO: 需要对 memoryMessages 单独建表存储
        [DispatchNodeResponseKeyEnum.memories]: {
          [agentPlanKey]: agentPlan,
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
    }

    // 简单 tool call 模式（一轮对话就结束了，不会多轮，所以不会受到连续对话的 taskIsComplexity 影响）
    return Promise.reject('目前未支持简单模式');
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
