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
import { SubAppIds, systemSubInfo } from './sub/constants';
import type { DispatchPlanAgentResponse } from './sub/plan';
import { dispatchPlanAgent } from './sub/plan';

import { getFileInputPrompt } from './sub/file/utils';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { masterCall } from './master/call';
import { addLog } from '../../../../../common/system/log';
import type { SkillToolType } from '@fastgpt/global/core/ai/skill/type';
import { getSubapps } from './utils';
import { type AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import { parseUserSystemPrompt } from './sub/plan/prompt';
import { parseUrlToFileType } from '@fastgpt/global/common/file/tools';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { DatasetSearchToolConfig } from './sub/dataset/utils';

export type DispatchAgentModuleProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.history]?: ChatItemType[];
  [NodeInputKeyEnum.userChatInput]: string;

  [NodeInputKeyEnum.fileUrlList]?: string[];
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]: string;
  [NodeInputKeyEnum.aiChatTemperature]?: number;
  [NodeInputKeyEnum.aiChatTopP]?: number;

  [NodeInputKeyEnum.selectedTools]?: SkillToolType[];

  // Knowledge base search configuration
  [NodeInputKeyEnum.datasetSelectList]?: SelectedDatasetType[];
  [NodeInputKeyEnum.datasetSimilarity]?: number;
  [NodeInputKeyEnum.datasetMaxTokens]?: number;
  [NodeInputKeyEnum.datasetSearchMode]?: `${DatasetSearchModeEnum}`;
  [NodeInputKeyEnum.datasetSearchEmbeddingWeight]?: number;
  [NodeInputKeyEnum.datasetSearchUsingReRank]?: boolean;
  [NodeInputKeyEnum.datasetSearchRerankModel]?: string;
  [NodeInputKeyEnum.datasetSearchRerankWeight]?: number;
  [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]?: boolean;
  [NodeInputKeyEnum.datasetSearchExtensionModel]?: string;
  [NodeInputKeyEnum.datasetSearchExtensionBg]?: string;
  [NodeInputKeyEnum.collectionFilterMatch]?: string;
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
      agent_selectedTools: selectedTools = [],
      // Dataset search configuration
      datasets: datasetSelectList,
      similarity: datasetSimilarity = 0.4,
      limit: datasetMaxTokens = 5000,
      searchMode: datasetSearchMode = DatasetSearchModeEnum.embedding,
      embeddingWeight: datasetSearchEmbeddingWeight,
      usingReRank: datasetSearchUsingReRank = false,
      rerankModel: datasetSearchRerankModel,
      rerankWeight: datasetSearchRerankWeight,
      datasetSearchUsingExtensionQuery: datasetSearchUsingExtensionQuery = false,
      datasetSearchExtensionModel: datasetSearchExtensionModel,
      datasetSearchExtensionBg: datasetSearchExtensionBg,
      collectionFilterMatch: collectionFilterMatch
    }
  } = props;
  const chatHistories = getHistories(history, histories);
  const historiesMessages = chats2GPTMessages({
    messages: chatHistories,
    reserveId: false,
    reserveTool: true
  });

  let planIterationCount = 0; // 规划迭代计数器

  const planMessagesKey = `planMessages-${nodeId}`;
  const agentPlanKey = `agentPlan-${nodeId}`;

  // 交互模式进来的话，这个值才是交互输入的值
  const interactiveInput = lastInteractive ? chatValue2RuntimePrompt(query).text : '';

  // Get history messages
  let { planHistoryMessages, agentPlan } = (() => {
    const lastHistory = chatHistories[chatHistories.length - 1];
    if (lastHistory && lastHistory.obj === ChatRoleEnum.AI) {
      return {
        planHistoryMessages: lastHistory.memories?.[
          planMessagesKey
        ] as ChatCompletionMessageParam[],
        agentPlan: lastHistory.memories?.[agentPlanKey] as AgentPlanType
      };
    }
    return {
      planHistoryMessages: undefined,
      agentPlan: undefined
    };
  })();
  const assistantResponses: AIChatItemValueItemType[] = [];
  const nodeResponses: ChatHistoryItemResType[] = [];

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

    // Build dataset configuration
    const datasetConfig: DatasetSearchToolConfig | undefined =
      datasetSelectList && datasetSelectList.length > 0
        ? {
            datasets: datasetSelectList,
            similarity: datasetSimilarity,
            maxTokens: datasetMaxTokens,
            searchMode: datasetSearchMode,
            embeddingWeight: datasetSearchEmbeddingWeight,
            usingReRank: datasetSearchUsingReRank,
            rerankModel: datasetSearchRerankModel,
            rerankWeight: datasetSearchRerankWeight,
            usingExtensionQuery: datasetSearchUsingExtensionQuery,
            extensionModel: datasetSearchExtensionModel,
            extensionBg: datasetSearchExtensionBg,
            collectionFilterMatch
          }
        : undefined;

    // Get sub apps
    const { completionTools: agentCompletionTools, subAppsMap: agentSubAppsMap } = await getSubapps(
      {
        tools: selectedTools,
        tmbId: runningAppInfo.tmbId,
        lang,
        getPlanTool: true,
        datasetConfig,
        fileSelectConfig: chatConfig?.fileSelectConfig
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

    // 生成文件信息提示
    const filesInfo =
      Object.keys(filesMap).length > 0
        ? `\n\n<available_files>
        当前对话中用户已上传以下文件：
        ${Object.entries(filesMap)
          .map(([index, url]) => {
            const fileInfo = parseUrlToFileType(url);
            return `- 文件${index}: ${fileInfo?.name || 'Unknown'} (类型: ${fileInfo?.type || 'file'})`;
          })
          .join('\n')}
        
        **重要提示**：
        - 如果用户的任务涉及文件分析、解析或处理，请在规划步骤时优先考虑使用文件解析工具
        - 在步骤的 description 中可以使用 @文件解析工具 来处理这些文件
        </available_files>`
        : '';

    const formatedSystemPrompt = parseUserSystemPrompt({
      userSystemPrompt: systemPrompt + filesInfo,
      getSubAppInfo
    });
    console.log(JSON.stringify(agentCompletionTools, null, 2), 'topAgent completionTools');
    // console.dir(agentSubAppsMap, {depth:null});

    /* ===== AI Start ===== */
    const parsePlanCallResult = (result: DispatchPlanAgentResponse) => {
      let { askInteractive, plan, completeMessages, usages } = result;
      // 调试代码
      // if (plan) {
      //   plan.steps = plan.steps.slice(0, 1);
      // }
      usagePush(usages);

      // SSE response
      // 只有当 plan 存在且有步骤时才推送
      if (plan && plan.steps.length > 0) {
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
      const result = await dispatchPlanAgent({
        checkIsStopping,
        defaultMessages: planHistoryMessages || historiesMessages,
        userInput: lastInteractive ? interactiveInput : userChatInput,
        interactive: lastInteractive,
        completionTools: agentCompletionTools,
        getSubAppInfo,
        systemPrompt: formatedSystemPrompt,
        model,
        stream,
        mode: 'initial' // 初始规划模式
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
    };
    const continuePlanCallFn = async () => {
      if (!agentPlan) return;

      addLog.debug(`All steps completed, check if need continue planning`);

      try {
        // 将当前轮次的步骤执行结果转换为消息格式
        const currentMessages = chats2GPTMessages({
          messages: [{ obj: ChatRoleEnum.AI, value: assistantResponses }],
          reserveId: false,
          reserveTool: true
        });

        // 构建完整上下文：历史消息 + 用户输入(根据场景) + 本轮所有的AI响应
        const userInputMessage =
          lastInteractive && interactiveInput
            ? [{ role: 'user' as const, content: interactiveInput }]
            : [];

        const result = await dispatchPlanAgent({
          checkIsStopping,
          defaultMessages: [...historiesMessages, ...userInputMessage, ...currentMessages],
          userInput:
            '请基于已执行的步骤结果，根据系统提示词来判断是否需要继续规划、生成总结报告步骤、还是任务已完成，或者遇到问题直接返回',
          interactive: lastInteractive,
          completionTools: agentCompletionTools,
          getSubAppInfo,
          systemPrompt: formatedSystemPrompt,
          model,
          stream,
          mode: 'continue' // 继续规划模式
        });

        const {
          completeMessages,
          askInteractive,
          plan: continuePlan
        } = parsePlanCallResult(result);

        if (continuePlan && continuePlan.steps.length > 0) {
          addLog.debug(
            `Continue planning: adding ${continuePlan.steps.length} new steps， ${continuePlan.steps.map((item) => item.title)}`
          );
          agentPlan.steps.push(...continuePlan.steps);
        } else {
          addLog.debug(`Continue planning: no new steps, planning complete`);
          agentPlan = undefined;
        }

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
      } catch (error) {
        addLog.error(`Continue planning failed`, error);
        // 规划失败时，清空 agentPlan，让任务正常结束
        agentPlan = undefined;
        return undefined;
      }
    };

    // 首轮任务
    let initialRequest = true;
    // 执行 Plan
    if (!!planHistoryMessages?.length) {
      initialRequest = false;
      const result = await planCallFn();
      // 有 result 代表 plan 有交互响应（ask）
      if (result) return result;
    }

    while (true) {
      if (checkIsStopping()) {
        break;
      }

      if (agentPlan) {
        console.log(`Start step call`, {
          agentPlan: JSON.stringify(agentPlan, null, 2)
        });

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
              defaultMessages: [],
              getSubAppInfo,
              completionTools: agentCompletionTools,
              steps: agentPlan.steps, // 传入所有步骤，而不仅仅是未执行的步骤
              step,
              filesMap,
              subAppsMap: agentSubAppsMap
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
        planIterationCount++;

        if (planIterationCount >= MAX_PLAN_ITERATIONS) {
          addLog.warn(`Max plan iteration reached: ${MAX_PLAN_ITERATIONS}, stopping`);
          agentPlan = undefined; // 强制结束规划
        } else {
          const continueResult = await continuePlanCallFn();

          // 如果有交互需求（Ask），直接返回
          if (continueResult) return continueResult;

          // 如果 agentPlan 被清空（返回空步骤数组），说明规划完成，跳出 agentPlan 分支
          // 如果 agentPlan 有新步骤，继续循环执行
        }

        if (!agentPlan) {
          addLog.debug(`Planning complete, hand over to master agent`);
          initialRequest = false;
          continue;
        }
      } else {
        addLog.debug(`Start master agent`);
        const messages = chats2GPTMessages({
          messages: [{ obj: ChatRoleEnum.AI, value: assistantResponses }],
          reserveId: false,
          reserveTool: true
        });

        // 构建完整上下文：历史消息 + 用户输入 + 本轮所有的AI响应
        // 如果是首轮直接输入用户的消息，如果是非首轮且有交互内容，则输入交互的内容
        const userInputMessage = initialRequest
          ? userChatInput
            ? [{ role: 'user' as const, content: userChatInput }]
            : []
          : lastInteractive && interactiveInput
            ? [{ role: 'user' as const, content: interactiveInput }]
            : [];

        // addLog.debug(`Master historiesMessages:${JSON.stringify(historiesMessages, null, 2)}`)
        // addLog.debug(`Master agent message:${JSON.stringify(messages, null, 2)}`)
        const result = await masterCall({
          ...props,
          systemPrompt: formatedSystemPrompt,
          initialRequest,
          defaultMessages: [...historiesMessages, ...userInputMessage, ...messages],
          getSubAppInfo,
          completionTools: agentCompletionTools,
          filesMap,
          subAppsMap: agentSubAppsMap
        });
        nodeResponses.push(result.nodeResponse);

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
        [agentPlanKey]: undefined,
        [planMessagesKey]: undefined
      },
      [DispatchNodeResponseKeyEnum.assistantResponses]: assistantResponses,
      [DispatchNodeResponseKeyEnum.nodeResponses]: nodeResponses
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};
