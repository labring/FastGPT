import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import type {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import { getNodeErrResponse, getHistories } from '../../utils';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ChatItemMiniType
} from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  chats2GPTMessages,
  chatValue2RuntimePrompt,
  runtimePrompt2ChatsValue,
  GPTMessages2Chats
} from '@fastgpt/global/core/chat/adapt';
import { getPlanCallResponseText } from '@fastgpt/global/core/chat/utils';
import { filterMemoryMessages } from '../utils';
import { getSystemToolInfo } from '@fastgpt/global/core/workflow/node/agent/constants';
import type { DispatchPlanAgentResponse } from './sub/plan';
import { dispatchPlanAgent } from './sub/plan';

import { formatFileInput } from './sub/file/utils';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { masterCall } from './master/call';
import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import {
  normalizeSkillIds,
  type SelectedAgentSkillItemType
} from '@fastgpt/global/core/app/formEdit/type';
import { getSubapps } from './utils';
import type { AgentCapability } from './capability/type';
import { createCapabilityToolCallHandler } from './capability/type';
import { createSandboxSkillsCapability } from './capability/sandboxSkills';
import { type AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import { getContinuePlanQuery, parseUserSystemPrompt } from './sub/plan/prompt';
import type { PlanAgentParamsType } from './sub/plan/constants';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { getLogger, LogCategories } from '../../../../../common/logger';
import { env } from '../../../../../env';
import { dispatchPiAgent } from './piAgent';
import { i18nT } from '../../../../../../web/i18n/utils';

export type DispatchAgentModuleProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.history]?: ChatItemMiniType[];
  [NodeInputKeyEnum.userChatInput]: string;

  [NodeInputKeyEnum.aiChatVision]?: boolean;
  [NodeInputKeyEnum.fileUrlList]?: string[];
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]: string;

  [NodeInputKeyEnum.selectedTools]?: SkillToolType[];
  [NodeInputKeyEnum.skills]?: Array<string | SelectedAgentSkillItemType>; // 兼容 string[]（debugChat）和对象数组（workflow NodeAgent）
  [NodeInputKeyEnum.useEditDebugSandbox]?: boolean; // 客户端显式指定使用 editDebug 沙箱

  // Knowledge base search configuration
  [NodeInputKeyEnum.datasetParams]?: AppFormEditFormType['dataset'];

  // Sandbox (Computer Use)
  [NodeInputKeyEnum.useAgentSandbox]?: boolean;
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
  // pi-agent-core engine: bypass Plan+Step orchestration
  if (env.AGENT_ENGINE === 'pi') {
    return dispatchPiAgent(props);
  }

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
    mode,
    chatId,
    showSkillReferences,
    params: {
      model,
      systemPrompt,
      userChatInput, // 本次任务的输入
      history = 6,
      fileUrlList: fileLinks,
      agent_selectedTools: selectedTools = [],
      skills: skillIds = [],
      useEditDebugSandbox,
      // Dataset search configuration
      agent_datasetParams: datasetParams,
      // Sandbox (Computer Use)
      useAgentSandbox = false
    }
  } = props;
  const chatHistories = getHistories(history, histories);
  const aiHistoryValues = chatHistories
    .filter((item) => item.obj === ChatRoleEnum.AI)
    .flatMap((item) => item.value);
  // 规范化：兼容 string[]（debugChat 路径）和 SelectedAgentSkillItemType[]（workflow NodeAgent 路径）
  const normalizedSkillIds = normalizeSkillIds(skillIds);
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
  const capabilities: AgentCapability[] = [];

  try {
    // Get files
    const fileUrlInput = inputs.find((item) => item.key === NodeInputKeyEnum.fileUrlList);
    if (!fileUrlInput || !fileUrlInput.value || fileUrlInput.value.length === 0) {
      fileLinks = undefined;
    }

    const {
      filesMap,
      allFilesMap,
      prompt: fileInputPrompt
    } = formatFileInput({
      fileUrls: fileLinks,
      requestOrigin,
      maxFiles: chatConfig?.fileSelectConfig?.maxFiles || 20,
      histories: chatHistories,
      useSkill: skillIds.length > 0
    });

    // 交互模式进来的话，这个值才是交互输入的值
    const { text: queryInput, files: queryFiles } = chatValue2RuntimePrompt(query);
    const formatUserChatInput = fileInputPrompt
      ? `${fileInputPrompt}\n\n${userChatInput}`
      : userChatInput;
    const currentUserMessage = chats2GPTMessages({
      messages: [
        {
          obj: ChatRoleEnum.Human,
          value: runtimePrompt2ChatsValue({
            text: formatUserChatInput,
            files: queryFiles
          })
        }
      ],
      reserveId: false
    })[0];

    let {
      masterMessages: restoredMasterMessages,
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

    let masterMessages = (() => {
      if (!restoredMasterMessages) {
        return historiesMessages.concat(currentUserMessage ? [currentUserMessage] : []);
      } else if (planHistoryMessages?.length) {
        return restoredMasterMessages ?? historiesMessages;
      } else {
        return currentUserMessage
          ? restoredMasterMessages.concat(currentUserMessage)
          : restoredMasterMessages;
      }
    })();
    // Initialize capabilities — always create sandbox capability (lazy-init, no container yet)
    // Skill capability is gated by SHOW_SKILL env: when disabled, we skip skill loading entirely
    // (no MongoDB query, no sandbox init), even if existing apps still have skills configured.
    if (env.SHOW_SKILL) {
      const sandboxSessionId = mode === 'chat' ? chatId : `debug-${runningAppInfo.id}-${nodeId}`;
      const useEditDebugSandbox_flag = !!useEditDebugSandbox;
      const sandboxMode = useEditDebugSandbox_flag ? 'editDebug' : 'sessionRuntime';

      const sandboxCap = await createSandboxSkillsCapability({
        skillIds: normalizedSkillIds,
        teamId: runningAppInfo.teamId,
        tmbId: runningAppInfo.tmbId,
        sessionId: sandboxSessionId,
        mode: sandboxMode,
        workflowStreamResponse,
        showSkillReferences: showSkillReferences === true,
        allFilesMap
      });
      capabilities.push(sandboxCap);
    }

    // Aggregate capability contributions
    const capabilitySystemPrompt = capabilities
      .map((c) => c.systemPrompt)
      .filter(Boolean)
      .join('\n\n');
    // TODO: 看看要不要和 getSubapps 合并
    const capabilityTools = capabilities.flatMap((c) => c.completionTools ?? []);
    const capabilityToolCallHandler =
      capabilities.length > 0 ? createCapabilityToolCallHandler(capabilities) : undefined;

    // Get sub apps
    const { completionTools: agentCompletionTools, subAppsMap: agentSubAppsMap } = await getSubapps(
      {
        tools: selectedTools,
        tmbId: runningAppInfo.tmbId,
        lang,
        getPlanTool: true,
        hasDataset: datasetParams && datasetParams.datasets.length > 0,
        hasFiles: !!chatConfig?.fileSelectConfig?.canSelectFile,
        useAgentSandbox: useAgentSandbox && !!global.feConfigs?.show_agent_sandbox,
        extraTools: capabilityTools
      }
    );

    const getSubAppInfo = (id: string) => {
      // diff user tool id and system tool id by prefix 't'
      const formatId = id.startsWith('t') ? id.slice(1) : id;

      const userToolNode = agentSubAppsMap.get(id) || agentSubAppsMap.get(formatId);
      if (userToolNode) {
        return {
          name: userToolNode.name || '',
          avatar: userToolNode.avatar || '',
          toolDescription: userToolNode.toolDescription || userToolNode.name || ''
        };
      }

      const systemToolNode = getSystemToolInfo(id, lang) || getSystemToolInfo(formatId, lang);

      return {
        name: systemToolNode?.name || '',
        avatar: systemToolNode?.avatar || '',
        toolDescription: systemToolNode?.toolDescription || systemToolNode?.name || ''
      };
    };
    const getSubApp = (id: string) => {
      const formatId = id.slice(1);
      return agentSubAppsMap.get(id) || agentSubAppsMap.get(formatId);
    };

    const formatedSystemPrompt = parseUserSystemPrompt({
      userSystemPrompt: capabilitySystemPrompt
        ? `${systemPrompt || ''}\n\n${capabilitySystemPrompt}`.trim()
        : systemPrompt,
      selectedDataset: datasetParams?.datasets
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

      if (askInteractive) {
        // 这里存储一份冗余的 planId，便于告诉 AI value 也存储一份 planId
        askInteractive.planId = planBuffer?.planId;
      }

      return {
        completeMessages,
        askInteractive,
        plan
      };
    };
    const planCallFn = async () => {
      // Plan: 2,4 场景
      if (!lastInteractive || !planHistoryMessages || !planBuffer) {
        getLogger(LogCategories.MODULE.AI.AGENT).error('Plan 结构逻辑错误');
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

      getLogger(LogCategories.MODULE.AI.AGENT).debug(
        `All steps completed, check if need continue planning`
      );
      const planResponseText = getPlanCallResponseText({
        plan: agentPlan,
        assistantResponses: [
          ...aiHistoryValues.filter((v) => v.planId === agentPlan!.planId),
          ...assistantResponses
        ]
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
            response: planResponseText
          }),
          ...agentPlan
        });

        const { plan: continuePlan } = parsePlanCallResult(result);

        if (continuePlan && continuePlan.steps.length > 0) {
          getLogger(LogCategories.MODULE.AI.AGENT).debug(
            `Continue planning: adding ${continuePlan.steps.length} new steps， ${continuePlan.steps.map((item) => item.title)}`
          );
          agentPlan.steps.push(...continuePlan.steps);
        } else {
          getLogger(LogCategories.MODULE.AI.AGENT).debug(
            `Continue planning: no new steps, planning complete`
          );
          agentPlan = undefined;
        }
      } catch (error) {
        getLogger(LogCategories.MODULE.AI.AGENT).error(`Continue planning failed`, { error });
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

      // Step calls
      if (agentPlan) {
        while (!checkIsStopping() && agentPlan.steps.filter((item) => !item.response).length) {
          for await (const step of agentPlan.steps) {
            if (checkIsStopping()) {
              break;
            }
            if (step.response) continue;

            getLogger(LogCategories.MODULE.AI.AGENT).debug(`Step call: ${step.id}`, step);
            assistantResponses.push({
              planId: agentPlan.planId,
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
              filesMap,
              capabilityToolCallHandler
            });
            const stepCallErrorText =
              result.nodeResponse.errorText?.trim() ||
              (result.nodeResponse.finishReason === 'error'
                ? i18nT('chat:completion_finish_error')
                : '');

            nodeResponses.push(result.nodeResponse);

            if (stepCallErrorText) {
              assistantResponses.push({
                text: { content: stepCallErrorText },
                planId: agentPlan.planId,
                stepId: step.id
              });
              workflowStreamResponse?.({
                stepId: step.id,
                event: SseResponseEventEnum.answer,
                data: textAdaptGptResponse({ text: stepCallErrorText })
              });

              const answerText = assistantResponses
                .filter((item) => item.text?.content)
                .map((item) => item.text!.content)
                .join('');

              return {
                data: {
                  [NodeOutputKeyEnum.answerText]: answerText
                },
                error: {
                  [NodeOutputKeyEnum.errorText]: stepCallErrorText
                },
                [DispatchNodeResponseKeyEnum.memories]: {
                  [masterMessagesKey]: undefined,
                  [agentPlanKey]: undefined,
                  [planMessagesKey]: undefined,
                  [planBufferKey]: undefined
                },
                [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
                [DispatchNodeResponseKeyEnum.nodeResponses]: nodeResponses,
                [DispatchNodeResponseKeyEnum.toolResponses]: stepCallErrorText
              };
            }

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
                planId: agentPlan!.planId,
                stepId: step.id
              }));
            assistantResponses.push(...assistantResponse);
            if (result.capabilityAssistantResponses?.length) {
              assistantResponses.push(
                ...result.capabilityAssistantResponses.map((item) => ({
                  ...item,
                  stepId: step.id
                }))
              );
            }

            step.response = result.stepResponse?.rawResponse;
            step.summary = result.stepResponse?.summary;
          }
        }

        // 用户主动暂停（相当于强制结束本轮 task，会清空所有状态）
        if (checkIsStopping()) {
          break;
        }

        // 所有步骤执行完后，固定调用 Plan Agent（继续规划模式）
        const planResponseText = getPlanCallResponseText({
          plan: agentPlan,
          assistantResponses: [
            ...aiHistoryValues.filter((v) => v.planId === agentPlan!.planId),
            ...assistantResponses
          ]
        });
        // 拼接 plan response 到 masterMessages 的 plan tool call 里（肯定在最后一个）
        const lastToolIndex = masterMessages.findLastIndex((item) => item.role === 'tool');
        if (lastToolIndex !== -1) {
          masterMessages[lastToolIndex].content = planResponseText;
        }
        planIterationCount++;

        if (planIterationCount >= MAX_PLAN_ITERATIONS) {
          getLogger(LogCategories.MODULE.AI.AGENT).warn(
            `Max plan iteration reached: ${MAX_PLAN_ITERATIONS}, stopping`
          );
          agentPlan = undefined; // 强制结束规划
        } else {
          const continueResult = await continuePlanCallFn();

          // 如果有交互需求（Ask），直接返回
          if (continueResult) return continueResult;
        }

        // 如果 agentPlan 被清空（返回空步骤数组），说明规划完成，跳出 agentPlan 分支
        // 如果 agentPlan 有新步骤，继续循环执行
        if (!agentPlan) {
          getLogger(LogCategories.MODULE.AI.AGENT).debug(
            `Planning complete, hand over to master agent`
          );
          continue;
        }
      } else {
        getLogger(LogCategories.MODULE.AI.AGENT).debug(`Start master agent`);
        const result = await masterCall({
          ...props,
          masterMessages,
          planMessages: planHistoryMessages || [],
          systemPrompt: formatedSystemPrompt,
          getSubAppInfo,
          getSubApp,
          completionTools: agentCompletionTools,
          filesMap,
          capabilityToolCallHandler
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
        if (result.capabilityAssistantResponses?.length) {
          assistantResponses.push(...result.capabilityAssistantResponses);
        }

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
                [masterMessagesKey]: masterMessages,
                [planMessagesKey]: filterMemoryMessages(completeMessages),
                [agentPlanKey]: plan,
                [planBufferKey]: result.planResponse.planBuffer
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
    const answerText = assistantResponses
      .filter((item) => item.text?.content)
      .map((item) => item.text!.content)
      .join('');

    return {
      data: {
        [NodeOutputKeyEnum.answerText]: answerText
      },
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
    getLogger(LogCategories.MODULE.AI.AGENT).error(`[Agent Debug] dispatchRunAgent caught error`, {
      error
    });
    return getNodeErrResponse({ error });
  } finally {
    for (const cap of capabilities) {
      await cap.dispose?.();
    }
  }
};
