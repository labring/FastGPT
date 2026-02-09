import { type HelperBotDispatchParamsType, type HelperBotDispatchResponseType } from '../type';
import { helperChats2GPTMessages } from '@fastgpt/global/core/chat/helperBot/adaptor';
import { getPrompt } from './prompt';
import { createLLMResponse } from '../../../../ai/llm/request';
import { getDefaultHelperBotModel } from '../../../../ai/model';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import {
  generateResourceList,
  extractResourcesFromPlan,
  buildSystemPrompt,
  buildDisplayText
} from './utils';
import { TopAgentAnswerSchema, TopAgentFormDataSchema } from './type';
import { addLog } from '../../../../../common/system/log';
import { formatAIResponse } from '../utils';
import type { TopAgentParamsType } from '@fastgpt/global/core/chat/helperBot/topAgent/type';
import type { UserInputInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { parseJsonArgs } from '../../../../ai/utils';
import { MongoDataset } from '../../../../dataset/schema';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';

export const dispatchTopAgent = async (
  props: HelperBotDispatchParamsType<TopAgentParamsType>
): Promise<HelperBotDispatchResponseType> => {
  const { query, files, data, histories, workflowResponseWrite, user } = props;

  const modelData = getDefaultHelperBotModel();
  if (!modelData) {
    return Promise.reject('Can not get model data');
  }

  const usage = {
    model: modelData.model,
    inputTokens: 0,
    outputTokens: 0
  };

  const { resourceList } = await generateResourceList({
    teamId: user.teamId,
    tmbId: user.tmbId,
    isRoot: user.isRoot,
    lang: user.lang
  });

  const systemPrompt = getPrompt({
    resourceList,
    metadata: data
  });

  const historyMessages = helperChats2GPTMessages({
    messages: histories
  });
  const conversationMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...historyMessages,
    { role: 'user' as const, content: query }
  ];

  const llmResponse = await createLLMResponse({
    body: {
      messages: conversationMessages,
      model: modelData,
      stream: true
    },
    onReasoning: ({ text }) => {
      workflowResponseWrite?.({
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({ reasoning_content: text })
      });
    }
    // onStreaming: ({ text }) => {
    //   workflowResponseWrite?.({
    //     event: SseResponseEventEnum.answer,
    //     data: textAdaptGptResponse({ text })
    //   });
    // }
  });

  usage.inputTokens = llmResponse.usage.inputTokens;
  usage.outputTokens = llmResponse.usage.outputTokens;

  const answerText = llmResponse.answerText;
  const reasoningText = llmResponse.reasoningText;
  // console.log('Top agent response:', answerText);
  try {
    const parseAnswer = (text: string) => {
      return TopAgentAnswerSchema.safeParseAsync(parseJsonArgs(text));
    };
    let result = await parseAnswer(answerText);
    // console.dir({ label: 'Top agent parsed result', result }, {
    //   depth: null,
    //   maxArrayLength: null
    // });
    if (!result.success) {
      addLog.warn('[Top agent] JSON parse failed, try repair', { text: answerText });

      const repairPrompt = `当前查询的用户问题：${query} \n辅助助手上一次的输出:\n${answerText}，\nJSON 解析的报错信息：\n${result.error} \n
         查看JSON 的报错信息来修正 JSON 格式错误，并仅返回正确的 JSON，确保 JSON 格式正确无误且可以被解析。不要包含任何多余的信息。`;
      const repairResponse = await createLLMResponse({
        body: {
          messages: [
            { role: 'system' as const, content: systemPrompt },
            ...historyMessages,
            {
              role: 'user' as const,
              content: repairPrompt
            }
          ],
          model: modelData,
          stream: true
        }
      });
      usage.inputTokens += repairResponse.usage.inputTokens;
      usage.outputTokens += repairResponse.usage.outputTokens;

      result = await parseAnswer(repairResponse.answerText);
      console.dir(
        { label: 'Top agent parsed result', result },
        {
          depth: null,
          maxArrayLength: null
        }
      );
      if (!result.success) {
        addLog.warn('[Top agent] JSON repair failed', { text: repairResponse.answerText });
        return {
          aiResponse: formatAIResponse({
            text: answerText,
            reasoning: reasoningText
          }),
          usage
        };
      }
    }

    const responseJson = result.data;

    if (responseJson.phase === 'generation') {
      addLog.debug('🔄 TopAgent: Configuration generation phase');

      const { tools, knowledges } = extractResourcesFromPlan(responseJson.execution_plan);
      const filterDatasets = await filterValidDatasets({
        teamId: user.teamId,
        datasetIds: knowledges
      });
      const formData = TopAgentFormDataSchema.parse({
        systemPrompt: buildSystemPrompt(responseJson), // 构建 system prompt
        tools, // 从 execution_plan 提取
        datasets: filterDatasets,
        fileUploadEnabled: responseJson.resources?.system_features?.file_upload?.enabled || false,
        executionPlan: responseJson.execution_plan // 保存原始 execution_plan
      });

      if (formData) {
        workflowResponseWrite?.({
          event: SseResponseEventEnum.topAgentConfig,
          data: formData
        });
      }

      workflowResponseWrite?.({
        event: SseResponseEventEnum.plan,
        data: {
          type: 'generation'
        }
      });

      return {
        aiResponse: formatAIResponse({
          text: buildDisplayText(responseJson), // 构建显示文本
          reasoning: reasoningText,
          planHint: {
            type: 'generation'
          }
        }),
        usage
      };
    } else {
      addLog.debug('📝 TopAgent: Information collection phase');

      const formDeata = responseJson.form;
      if (formDeata) {
        const inputForm: UserInputInteractive = {
          type: 'userInput',
          params: {
            inputForm: formDeata.map((item) => {
              return {
                type: item.type as FlowNodeInputTypeEnum,
                key: getNanoid(6),
                label: item.label,
                value: '',
                required: false,
                valueType:
                  item.type === FlowNodeInputTypeEnum.numberInput
                    ? WorkflowIOValueTypeEnum.number
                    : WorkflowIOValueTypeEnum.string,
                list:
                  'options' in item
                    ? item.options?.map((option) => ({ label: option, value: option }))
                    : undefined
              };
            }),
            description: responseJson.question
          }
        };
        workflowResponseWrite?.({
          event: SseResponseEventEnum.collectionForm,
          data: inputForm
        });

        return {
          aiResponse: formatAIResponse({
            text: responseJson.question,
            reasoning: reasoningText,
            collectionForm: inputForm
          }),
          usage
        };
      }

      workflowResponseWrite?.({
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({ text: responseJson.question })
      });

      return {
        aiResponse: formatAIResponse({
          text: responseJson.question,
          reasoning: reasoningText
        }),
        usage
      };
    }
  } catch (e) {
    addLog.warn(`[Top agent] Failed to parse JSON response`, { text: answerText });
    return {
      aiResponse: formatAIResponse({
        text: answerText,
        reasoning: reasoningText
      }),
      usage
    };
  }
};

const filterValidDatasets = async ({
  teamId,
  datasetIds
}: {
  teamId: string;
  datasetIds: string[];
}): Promise<SelectedDatasetType[]> => {
  // Check datasetIds is
  const result = await MongoDataset.find(
    {
      teamId,
      _id: {
        $in: datasetIds.filter((id) => {
          const parse = ObjectIdSchema.safeParse(id);
          return parse.success;
        })
      }
    },
    '_id avatar name vectorModel'
  ).lean();
  return result.map((item) => ({
    datasetId: String(item._id),
    avatar: item.avatar,
    name: item.name,
    vectorModel: {
      model: item.vectorModel
    }
  }));
};
