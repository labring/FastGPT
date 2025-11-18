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
import { chats2GPTMessages, chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { formatModelChars2Points } from '../../../../../support/wallet/usage/utils';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { getMultiplePrompt } from './constants';
import { filterToolResponseToPreview } from './utils';
import { getFileContentFromLinks, getHistoryFileLinks } from '../../tools/readFiles';
import { parseUrlToFileType } from '@fastgpt/global/common/file/tools';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getDocumentQuotePrompt } from '@fastgpt/global/core/ai/prompt/AIChat';
import { postTextCensor } from '../../../../chat/postTextCensor';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { McpToolDataType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import type { JSONSchemaInputType } from '@fastgpt/global/core/app/jsonschema';
import { getFileS3Key } from '../../../../../common/s3/utils';

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
      aiChatVision,
      aiChatReasoning,
      isResponseAnswerText = true
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

  // Check task complexity: 第一次进入任务时候进行判断。（有 plan了，说明已经开始执行任务了）
  const isCheckTaskComplexityStep = isPlanAgent && !agentPlan && !planHistoryMessages;

  try {
    // Get files
    const fileUrlInput = inputs.find((item) => item.key === NodeInputKeyEnum.fileUrlList);
    if (!fileUrlInput || !fileUrlInput.value || fileUrlInput.value.length === 0) {
      fileLinks = undefined;
    }
<<<<<<< HEAD
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
      const planCallFn = async () => {
        // 点了确认。此时肯定有 agentPlans
        if (
          lastInteractive?.type === 'agentPlanCheck' &&
          interactiveInput === ConfirmPlanAgentText &&
          agentPlan
        ) {
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

<<<<<<<< HEAD:packages/service/core/workflow/dispatch/ai/tool/index.ts
    const {
      toolWorkflowInteractiveResponse,
      toolDispatchFlowResponses, // tool flow response
=======

    const toolNodeIds = filterToolNodeIdByEdges({ nodeId, edges: runtimeEdges });
    const toolNodes = getToolNodesByIds({ toolNodeIds, runtimeNodes });

    // Check interactive entry
    props.node.isEntry = false;
    const hasReadFilesTool = toolNodes.some(
      (item) => item.flowNodeType === FlowNodeTypeEnum.readFiles
    );

    const globalFiles = chatValue2RuntimePrompt(query).files;
    const { documentQuoteText, userFiles } = await getMultiInput({
      runningUserInfo,
      histories: chatHistories,
      requestOrigin,
      maxFiles: chatConfig?.fileSelectConfig?.maxFiles || 20,
      customPdfParse: chatConfig?.fileSelectConfig?.customPdfParse,
      fileLinks,
      inputFiles: globalFiles,
<<<<<<< HEAD
      hasReadFilesTool,
      usageId,
      appId: props.runningAppInfo.id,
      chatId: props.chatId,
      uId: props.uid
=======
      hasReadFilesTool
>>>>>>> a48ad2abe (squash: compress all commits into one)
    });

    const concatenateSystemPrompt = [
      toolModel.defaultSystemChatPrompt,
      systemPrompt,
      documentQuoteText
        ? replaceVariable(getDocumentQuotePrompt(version), {
            quote: documentQuoteText
          })
        : ''
    ]
      .filter(Boolean)
      .join('\n\n===---===---===\n\n');

    const messages: ChatItemType[] = (() => {
      const value: ChatItemType[] = [
        ...getSystemPrompt_ChatItemType(concatenateSystemPrompt),
        // Add file input prompt to histories
        ...chatHistories.map((item) => {
          if (item.obj === ChatRoleEnum.Human) {
            return {
              ...item,
              value: toolCallMessagesAdapt({
                userInput: item.value,
                skip: !hasReadFilesTool
              })
            };
          }
          return item;
        }),
        {
          obj: ChatRoleEnum.Human,
          value: toolCallMessagesAdapt({
            skip: !hasReadFilesTool,
            userInput: runtimePrompt2ChatsValue({
              text: userChatInput,
              files: userFiles
            })
          })
        }
      ];
      if (lastInteractive && isEntry) {
        return value.slice(0, -2);
      }
      return value;
    })();

    // censor model and system key
    if (toolModel.censor && !externalProvider.openaiAccount?.key) {
      await postTextCensor({
        text: `${systemPrompt}
          ${userChatInput}
        `
      });
    }

    const {
      toolWorkflowInteractiveResponse,
      dispatchFlowResponse, // tool flow response
>>>>>>> 757253617 (squash: compress all commits into one)
      toolCallInputTokens,
      toolCallOutputTokens,
      completeMessages = [], // The actual message sent to AI(just save text)
      assistantResponses = [], // FastGPT system store assistant.value response
<<<<<<< HEAD
=======
      runTimes,
>>>>>>> 757253617 (squash: compress all commits into one)
      finish_reason
    } = await (async () => {
      const adaptMessages = chats2GPTMessages({
        messages,
        reserveId: false
        // reserveTool: !!toolModel.toolChoice
      });
<<<<<<< HEAD

      return runToolCall({
        ...props,
=======
      const requestParams = {
>>>>>>> 757253617 (squash: compress all commits into one)
        runtimeNodes,
        runtimeEdges,
        toolNodes,
        toolModel,
        messages: adaptMessages,
<<<<<<< HEAD
        childrenInteractiveParams:
          lastInteractive?.type === 'toolChildrenInteractive' ? lastInteractive.params : undefined
========
          const { answerText, plan, completeMessages, usages, interactiveResponse } =
            await dispatchPlanAgent({
              historyMessages: planHistoryMessages || historiesMessages,
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

          usagePush(usages);
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

        const text = `${answerText}${agentPlan ? `\n\`\`\`json\n${JSON.stringify(agentPlan, null, 2)}\n\`\`\`\n` : ''}`;
        workflowStreamResponse?.({
          event: SseResponseEventEnum.answer,
          data: textAdaptGptResponse({
            text
          })
        });

        usagePush(usages);
        // Sub agent plan 不会有交互响应。Top agent plan 肯定会有。
        if (interactiveResponse) {
          return {
            [DispatchNodeResponseKeyEnum.answerText]: `${tmpText}${text}`,
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

      // 执行 Plan/replan
      if (isPlanStep) {
        const result = await planCallFn();
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
>>>>>>>> 757253617 (squash: compress all commits into one):packages/service/core/workflow/dispatch/ai/agent/index.ts
      });

<<<<<<<< HEAD:packages/service/core/workflow/dispatch/ai/tool/index.ts
    // Usage computed
=======
        interactiveEntryToolParams: lastInteractive?.toolParams
      };

      return runToolCall({
        ...props,
        ...requestParams,
        maxRunToolTimes: 100
      });
    })();

>>>>>>> 757253617 (squash: compress all commits into one)
    const { totalPoints: modelTotalPoints, modelName } = formatModelChars2Points({
      model,
      inputTokens: toolCallInputTokens,
      outputTokens: toolCallOutputTokens
    });
    const modelUsage = externalProvider.openaiAccount?.key ? 0 : modelTotalPoints;

<<<<<<< HEAD
    const toolUsages = toolDispatchFlowResponses.map((item) => item.flowUsages).flat();
    const toolTotalPoints = toolUsages.reduce((sum, item) => sum + item.totalPoints, 0);
========
      /* ===== Master agent, 逐步执行 plan ===== */
      if (!agentPlan) return Promise.reject('没有 plan');

      let assistantResponses: AIChatItemValueItemType[] = [];
>>>>>>>> 757253617 (squash: compress all commits into one):packages/service/core/workflow/dispatch/ai/agent/index.ts

      while (agentPlan.steps!.filter((item) => !item.response)!.length) {
        const pendingSteps = agentPlan?.steps!.filter((item) => !item.response)!;

<<<<<<<< HEAD:packages/service/core/workflow/dispatch/ai/tool/index.ts
    // Preview assistant responses
=======
    const toolUsages = dispatchFlowResponse.map((item) => item.flowUsages).flat();
    const toolTotalPoints = toolUsages.reduce((sum, item) => sum + item.totalPoints, 0);

    // concat tool usage
    const totalPointsUsage = modelUsage + toolTotalPoints;

>>>>>>> 757253617 (squash: compress all commits into one)
    const previewAssistantResponses = filterToolResponseToPreview(assistantResponses);

    return {
      data: {
        [NodeOutputKeyEnum.answerText]: previewAssistantResponses
          .filter((item) => item.text?.content)
          .map((item) => item.text?.content || '')
          .join('')
      },
<<<<<<< HEAD
      [DispatchNodeResponseKeyEnum.runTimes]: toolDispatchFlowResponses.reduce(
        (sum, item) => sum + item.runTimes,
        0
      ),
<<<<<<< HEAD
      [DispatchNodeResponseKeyEnum.assistantResponses]: isResponseAnswerText
        ? previewAssistantResponses
        : undefined,
=======
=======
      [DispatchNodeResponseKeyEnum.runTimes]: runTimes,
>>>>>>> 757253617 (squash: compress all commits into one)
      [DispatchNodeResponseKeyEnum.assistantResponses]: previewAssistantResponses,
>>>>>>> a48ad2abe (squash: compress all commits into one)
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        // 展示的积分消耗
        totalPoints: totalPointsUsage,
        toolCallInputTokens: toolCallInputTokens,
        toolCallOutputTokens: toolCallOutputTokens,
        childTotalPoints: toolTotalPoints,
        model: modelName,
        query: userChatInput,
        historyPreview: getHistoryPreview(
          GPTMessages2Chats({ messages: completeMessages, reserveTool: false }),
          10000,
          useVision
        ),
<<<<<<< HEAD
        toolDetail: toolDispatchFlowResponses.map((item) => item.flowResponses).flat(),
=======
        toolDetail: dispatchFlowResponse.map((item) => item.flowResponses).flat(),
>>>>>>> 757253617 (squash: compress all commits into one)
        mergeSignId: nodeId,
        finishReason: finish_reason
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
        // 模型本身的积分消耗
        {
          moduleName: name,
          model: modelName,
          totalPoints: modelUsage,
          inputTokens: toolCallInputTokens,
          outputTokens: toolCallOutputTokens
<<<<<<< HEAD
========
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
          assistantResponses.push(...result.assistantResponses);
        }

        if (agentPlan?.replan === true) {
          const replanResult = await replanCallFn({
            plan: agentPlan
          });
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
>>>>>>>> 757253617 (squash: compress all commits into one):packages/service/core/workflow/dispatch/ai/agent/index.ts
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
=======
        },
        // 工具的消耗
        ...toolUsages
      ],
      [DispatchNodeResponseKeyEnum.interactive]: toolWorkflowInteractiveResponse
    };
>>>>>>> 757253617 (squash: compress all commits into one)
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};

<<<<<<< HEAD
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
=======
const getMultiInput = async ({
  runningUserInfo,
  histories,
  fileLinks,
  requestOrigin,
  maxFiles,
  customPdfParse,
  inputFiles,
<<<<<<< HEAD
  hasReadFilesTool,
  usageId,
  appId,
  chatId,
  uId
=======
  hasReadFilesTool
>>>>>>> a48ad2abe (squash: compress all commits into one)
}: {
  runningUserInfo: ChatDispatchProps['runningUserInfo'];
  histories: ChatItemType[];
  fileLinks?: string[];
  requestOrigin?: string;
  maxFiles: number;
  customPdfParse?: boolean;
  inputFiles: UserChatItemValueItemType['file'][];
  hasReadFilesTool: boolean;
<<<<<<< HEAD
  usageId?: string;
  appId: string;
  chatId?: string;
  uId: string;
=======
>>>>>>> a48ad2abe (squash: compress all commits into one)
}) => {
  // Not file quote
  if (!fileLinks || hasReadFilesTool) {
    return {
      documentQuoteText: '',
      userFiles: inputFiles
    };
  }

  const filesFromHistories = getHistoryFileLinks(histories);
  const urls = [...fileLinks, ...filesFromHistories];

  if (urls.length === 0) {
    return {
      documentQuoteText: '',
      userFiles: []
    };
  }

  // Get files from histories
  const { text } = await getFileContentFromLinks({
    // Concat fileUrlList and filesFromHistories; remove not supported files
    urls,
    requestOrigin,
    maxFiles,
    customPdfParse,
    teamId: runningUserInfo.teamId,
    tmbId: runningUserInfo.tmbId
  });

  return {
    documentQuoteText: text,
    userFiles: fileLinks.map((url) => parseUrlToFileType(url)).filter(Boolean)
>>>>>>> 757253617 (squash: compress all commits into one)
  };
};
