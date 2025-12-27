import type { ChatCompletionMessageParam, ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { runAgentCall } from '../../../../../ai/llm/agentCall';
import { chats2GPTMessages, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { addFilePrompt2Input, ReadFileToolSchema } from '../sub/file/utils';
import type { AgentPlanStepType, AgentPlanType } from '../sub/plan/type';
import type { GetSubAppInfoFnType, SubAppRuntimeType } from '../type';
import { getMasterAgentSystemPrompt } from '../constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { getWorkflowChildResponseWrite } from '../../../utils';
import { SubAppIds } from '../sub/constants';
import { parseJsonArgs } from '../../../../../ai/utils';
import { dispatchFileRead } from '../sub/file';
import { dispatchTool } from '../sub/tool';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { DispatchAgentModuleProps } from '..';
import { getLLMModel } from '../../../../../ai/model';
import { getStepDependon } from './dependon';
import { getOneStepResponseSummary } from './responseSummary';
import type { DispatchPlanAgentResponse } from '../sub/plan';
import { dispatchPlanAgent } from '../sub/plan';
import { addLog } from '../../../../../../common/system/log';

type Response = {
  stepResponse?: {
    rawResponse: string;
    summary: string;
  };
  planResponse?: DispatchPlanAgentResponse;
  completeMessages: ChatCompletionMessageParam[];
  assistantMessages: ChatCompletionMessageParam[];
};

export const masterCall = async ({
  historiesMessages,
  getSubAppInfo,
  completionTools,
  filesMap,
  subAppsMap,
  steps,
  step,
  ...props
}: DispatchAgentModuleProps & {
  historiesMessages: ChatCompletionMessageParam[];
  getSubAppInfo: GetSubAppInfoFnType;
  completionTools: ChatCompletionTool[];
  filesMap: Record<string, string>;
  subAppsMap: Map<string, SubAppRuntimeType>;

  // Step call
  steps?: AgentPlanStepType[];
  step?: AgentPlanStepType;
}): Promise<Response> => {
  const {
    checkIsStopping,
    node: { nodeId },
    chatConfig,
    runningUserInfo,
    runningAppInfo,
    variables,
    externalProvider,
    stream,
    workflowStreamResponse,
    usagePush,
    params: { userChatInput, systemPrompt, model, temperature, aiChatTopP }
  } = props;

  const isStepCall = steps && step;
  if (isStepCall) {
    completionTools = completionTools.filter((item) => item.function.name !== SubAppIds.plan);
  }

  const { requestMessages } = await (async () => {
    if (isStepCall) {
      // Get depends on step ids
      if (!step.depends_on) {
        const { depends, usage: dependsUsage } = await getStepDependon({
          model,
          steps,
          step
        });
        if (dependsUsage) {
          usagePush([dependsUsage]);
        }
        step.depends_on = depends;
      }
      // Step call system prompt
      // TODO: 需要把压缩的 usage 返回
      const systemPromptContent = await getMasterAgentSystemPrompt({
        steps,
        step,
        userInput: userChatInput,
        model,
        background: systemPrompt
      });

      const requestMessages = chats2GPTMessages({
        messages: [
          {
            obj: ChatRoleEnum.System,
            value: [
              {
                text: {
                  content: systemPromptContent
                }
              }
            ]
          },
          {
            obj: ChatRoleEnum.Human,
            value: runtimePrompt2ChatsValue({
              text: addFilePrompt2Input({ query: step.description }),
              files: []
            })
          }
        ],
        reserveId: false
      });

      return { requestMessages };
    }

    // Get history messages
    const messages: ChatCompletionMessageParam[] = [
      ...(systemPrompt
        ? [
            {
              role: 'system' as const,
              content: systemPrompt
            }
          ]
        : []),
      ...historiesMessages,
      ...(historiesMessages[historiesMessages.length - 1]?.role === 'tool'
        ? []
        : [
            {
              role: 'user' as const,
              content: userChatInput
            }
          ])
    ];
    return {
      requestMessages: messages
    };
  })();

  // console.log('Master call requestMessages', JSON.stringify(requestMessages, null, 2));

  let planResult: DispatchPlanAgentResponse | undefined;

  const {
    assistantMessages,
    completeMessages,
    inputTokens,
    outputTokens,
    subAppUsages,
    interactiveResponse
  } = await runAgentCall({
    maxRunAgentTimes: 100,
    body: {
      messages: requestMessages,
      model: getLLMModel(model),
      temperature,
      stream,
      top_p: aiChatTopP,
      tools: completionTools
    },

    userKey: externalProvider.openaiAccount,
    isAborted: checkIsStopping,
    // childrenInteractiveParams

    onReasoning({ text }) {
      workflowStreamResponse?.({
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          reasoning_content: text
        })
      });
    },
    onStreaming({ text }) {
      workflowStreamResponse?.({
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text
        })
      });
    },
    onToolCall({ call }) {
      const subApp = getSubAppInfo(call.function.name);
      workflowStreamResponse?.({
        id: call.id,
        event: SseResponseEventEnum.toolCall,
        data: {
          tool: {
            id: call.id,
            toolName: subApp?.name || call.function.name,
            toolAvatar: subApp?.avatar || '',
            functionName: call.function.name,
            params: call.function.arguments ?? ''
          }
        }
      });
    },
    onToolParam({ tool, params }) {
      workflowStreamResponse?.({
        id: tool.id,
        event: SseResponseEventEnum.toolParams,
        data: {
          tool: {
            params
          }
        }
      });
    },
    handleToolResponse: async ({ call, messages }) => {
      addLog.debug('handleToolResponse', { toolName: call.function.name });
      const toolId = call.function.name;

      const {
        response,
        usages = [],
        stop = false
      } = await (async () => {
        try {
          if (toolId === SubAppIds.fileRead) {
            const toolParams = ReadFileToolSchema.safeParse(parseJsonArgs(call.function.arguments));

            if (!toolParams.success) {
              return {
                response: toolParams.error.message,
                usages: []
              };
            }
            const params = toolParams.data;

            const files = params.file_indexes.map((index) => ({
              index,
              url: filesMap[index]
            }));
            const result = await dispatchFileRead({
              files,
              teamId: runningUserInfo.teamId,
              tmbId: runningUserInfo.tmbId,
              customPdfParse: chatConfig?.fileSelectConfig?.customPdfParse
            });
            return {
              response: result.response,
              usages: result.usages
            };
          }
          if (toolId === SubAppIds.plan) {
            try {
              planResult = await dispatchPlanAgent({
                checkIsStopping,
                historyMessages: historiesMessages,
                userInput: userChatInput,
                completionTools,
                getSubAppInfo,
                systemPrompt: systemPrompt,
                model,
                stream
              });

              return {
                response: '',
                stop: true
              };
            } catch (error) {
              return {
                response: getErrText(error),
                stop: false
              };
            }
          }
          // User Sub App
          else {
            const tool = subAppsMap.get(toolId);
            if (!tool) {
              return {
                response: 'Can not find the tool',
                usages: []
              };
            }

            const toolCallParams = parseJsonArgs(call.function.arguments);

            if (!toolCallParams) {
              return {
                response: 'params is not object',
                usages: []
              };
            }

            // Get params
            const requestParams = {
              ...tool.params,
              ...toolCallParams
            };

            if (tool.type === 'tool') {
              const { response, usages } = await dispatchTool({
                tool: {
                  name: tool.name,
                  version: tool.version,
                  toolConfig: tool.toolConfig
                },
                params: requestParams,
                runningUserInfo,
                runningAppInfo,
                variables,
                workflowStreamResponse
              });
              return {
                response,
                usages
              };
            } else if (tool.type === 'workflow' || tool.type === 'toolWorkflow') {
              // const fn = tool.type === 'workflow' ? dispatchApp : dispatchPlugin;

              // const { response, usages } = await fn({
              //   ...props,
              //   node,
              //   workflowStreamResponse,
              //   callParams: {
              //     appId: node.pluginId,
              //     version: node.version,
              //     ...requestParams
              //   }
              // });

              // return {
              //   response,
              //   usages
              // };
              return {
                response: 'Can not find the tool',
                usages: []
              };
            } else {
              return {
                response: 'Can not find the tool',
                usages: []
              };
            }
          }
        } catch (error) {
          return {
            response: getErrText(error),
            usages: []
          };
        }
      })();

      // Push stream response
      workflowStreamResponse?.({
        id: call.id,
        event: SseResponseEventEnum.toolResponse,
        data: {
          tool: {
            response
          }
        }
      });

      // TODO: 推送账单

      return {
        response,
        assistantMessages: [], // TODO
        usages,
        stop
      };
    },
    handleInteractiveTool: async ({ toolParams }) => {
      return {
        response: 'Interactive tool not supported',
        assistantMessages: [], // TODO
        usages: []
      };
    }
  });

  // Step call
  if (isStepCall) {
    const answerText = assistantMessages
      .map((item) => {
        if (item.role === 'assistant' && item.content) {
          if (typeof item.content === 'string') {
            return item.content;
          } else {
            return item.content
              .map((content) => (content.type === 'text' ? content.text : ''))
              .join('\n');
          }
        }
        return '';
      })
      .join('\n');

    // Get step response summary
    const { answerText: summary, usage: summaryUsage } = await getOneStepResponseSummary({
      response: answerText,
      model
    });
    if (summaryUsage) {
      usagePush([summaryUsage]);
    }

    return {
      stepResponse: {
        rawResponse: answerText,
        summary
      },
      completeMessages,
      assistantMessages
    };
  }

  // Default
  return {
    planResponse: planResult,
    completeMessages,
    assistantMessages
  };
};
