import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { runAgentCall } from '../../../../../ai/llm/agentCall';
import { chats2GPTMessages, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { addFilePrompt2Input } from '../sub/file/utils';
import type { AgentPlanStepType } from '../sub/plan/type';
import type { GetSubAppInfoFnType } from '../type';
import { getMasterAgentSystemPrompt } from '../constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import {
  getReferenceVariableValue,
  replaceEditorVariable,
  textAdaptGptResponse,
  valueTypeFormat
} from '@fastgpt/global/core/workflow/runtime/utils';
import { getWorkflowChildResponseWrite } from '../../../utils';
import { SubAppIds } from '../sub/constants';
import { parseJsonArgs } from '../../../../../ai/utils';
import { dispatchFileRead } from '../sub/file';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { dispatchTool } from '../sub/tool';
import { dispatchApp, dispatchPlugin } from '../sub/app';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { DispatchAgentModuleProps } from '..';
import { getLLMModel } from '../../../../../ai/model';
import { getStepDependon } from './dependon';
import { getResponseSummary } from './responseSummary';

export const stepCall = async ({
  getSubAppInfo,
  subAppList,
  steps,
  step,
  filesMap,
  subAppsMap,
  ...props
}: DispatchAgentModuleProps & {
  getSubAppInfo: GetSubAppInfoFnType;
  subAppList: ChatCompletionTool[];
  steps: AgentPlanStepType[];
  step: AgentPlanStepType;
  filesMap: Record<string, string>;
  subAppsMap: Map<string, RuntimeNodeItemType>;
}) => {
  const {
    res,
    node: { nodeId },
    runtimeNodes,
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

  // Step call request messages
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
  // console.log(
  //   'Step call requestMessages',
  //   JSON.stringify({ requestMessages, subAppList }, null, 2)
  // );

  const { assistantMessages, inputTokens, outputTokens, subAppUsages, interactiveResponse } =
    await runAgentCall({
      maxRunAgentTimes: 100,
      body: {
        messages: requestMessages,
        model: getLLMModel(model),
        temperature,
        stream,
        top_p: aiChatTopP,
        tools: subAppList
      },

      userKey: externalProvider.openaiAccount,
      isAborted: res ? () => res.closed : undefined,
      // childrenInteractiveParams

      onReasoning({ text }) {
        workflowStreamResponse?.({
          stepId: step.id,
          event: SseResponseEventEnum.answer,
          data: textAdaptGptResponse({
            reasoning_content: text
          })
        });
      },
      onStreaming({ text }) {
        workflowStreamResponse?.({
          stepId: step.id,
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
          stepId: step.id,
          event: SseResponseEventEnum.toolCall,
          data: {
            tool: {
              id: `${nodeId}/${call.function.name}`,
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
          stepId: step.id,
          event: SseResponseEventEnum.toolParams,
          data: {
            tool: {
              params
            }
          }
        });
      },

      // TODO: 对齐最新的方案
      handleToolResponse: async ({ call, messages }) => {
        const toolId = call.function.name;
        const childWorkflowStreamResponse = getWorkflowChildResponseWrite({
          id: call.id,
          stepId: step.id,
          fn: workflowStreamResponse
        });

        const { response, usages = [] } = await (async () => {
          try {
            if (toolId === SubAppIds.fileRead) {
              const params = parseJsonArgs<{
                file_indexes: string[];
              }>(call.function.arguments);
              if (!params) {
                return {
                  response: 'params is not object',
                  usages: []
                };
              }
              if (!Array.isArray(params.file_indexes)) {
                return {
                  response: 'file_indexes is not array',
                  usages: []
                };
              }

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
            // User Sub App
            else {
              const node = subAppsMap.get(toolId);
              if (!node) {
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
              const requestParams = (() => {
                const params: Record<string, any> = toolCallParams;

                node.inputs.forEach((input) => {
                  if (input.key in toolCallParams) {
                    return;
                  }
                  // Skip some special key
                  if (
                    [
                      NodeInputKeyEnum.childrenNodeIdList,
                      NodeInputKeyEnum.systemInputConfig
                    ].includes(input.key as NodeInputKeyEnum)
                  ) {
                    params[input.key] = input.value;
                    return;
                  }

                  // replace {{$xx.xx$}} and {{xx}} variables
                  let value = replaceEditorVariable({
                    text: input.value,
                    nodes: runtimeNodes,
                    variables
                  });

                  // replace reference variables
                  value = getReferenceVariableValue({
                    value,
                    nodes: runtimeNodes,
                    variables
                  });

                  params[input.key] = valueTypeFormat(value, input.valueType);
                });

                return params;
              })();

              if (node.flowNodeType === FlowNodeTypeEnum.tool) {
                const { response, usages } = await dispatchTool({
                  node,
                  params: requestParams,
                  runningUserInfo,
                  runningAppInfo,
                  variables,
                  workflowStreamResponse: childWorkflowStreamResponse
                });
                return {
                  response,
                  usages
                };
              } else if (
                node.flowNodeType === FlowNodeTypeEnum.appModule ||
                node.flowNodeType === FlowNodeTypeEnum.pluginModule
              ) {
                const fn =
                  node.flowNodeType === FlowNodeTypeEnum.appModule ? dispatchApp : dispatchPlugin;

                const { response, usages } = await fn({
                  ...props,
                  node,
                  workflowStreamResponse: childWorkflowStreamResponse,
                  callParams: {
                    appId: node.pluginId,
                    version: node.version,
                    ...requestParams
                  }
                });

                return {
                  response,
                  usages
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
              id: call.id,
              response
            }
          }
        });

        // TODO: 推送账单

        return {
          response,
          assistantMessages: [], // TODO
          usages
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
  const { answerText: summary, usage: summaryUsage } = await getResponseSummary({
    response: answerText,
    model
  });
  if (summaryUsage) {
    usagePush([summaryUsage]);
  }

  return {
    rawResponse: answerText,
    summary,
    assistantMessages
  };
};
