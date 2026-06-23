import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ContextExtractAgentItemType } from '@fastgpt/global/core/workflow/template/system/contextExtract/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  NodeOutputKeyEnum,
  toolValueTypeList,
  valueTypeJsonSchemaMap
} from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { sliceJsonStr } from '@fastgpt/global/common/string/tools';
import { type LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { getNodeErrResponse, getHistories } from '../utils';
import { getLLMModel } from '../../../ai/model';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import json5 from 'json5';
import { getLogger, LogCategories } from '../../../../common/logger';

const logger = getLogger(LogCategories.MODULE.WORKFLOW.AI);
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { getExtractJsonPrompt } from '@fastgpt/global/core/ai/prompt/agent';
import { createLLMResponse } from '../../../ai/llm/request';
import type { JsonSchemaPropertiesItemType } from '@fastgpt/global/core/app/jsonschema';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.history]?: ChatItemMiniType[];
  [NodeInputKeyEnum.contextExtractInput]: string;
  [NodeInputKeyEnum.extractKeys]: ContextExtractAgentItemType[];
  [NodeInputKeyEnum.description]: string;
  [NodeInputKeyEnum.aiModel]: string;
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.success]: boolean;
  [NodeOutputKeyEnum.contextExtractFields]: string;
  [key: string]: any;
}>;

type ActionProps = Props & { extractModel: LLMModelItemType; lastMemory?: Record<string, any> };

export async function dispatchContentExtract(props: Props): Promise<Response> {
  const {
    runningAppInfo,
    node: { nodeId, name },
    histories,
    params: { content, history = 6, model, description, extractKeys }
  } = props;

  if (!content) {
    return getNodeErrResponse({ error: 'Input is empty' });
  }

  const extractModel = getLLMModel(model);
  const chatHistories = getHistories(history, histories);

  const memoryKey = `${runningAppInfo.id}-${nodeId}`;
  // @ts-ignore
  const lastMemory = chatHistories[chatHistories.length - 1]?.memories?.[memoryKey] as Record<
    string,
    any
  >;

  try {
    const { arg, inputTokens, outputTokens, usedUserOpenAIKey } = await completions({
      ...props,
      histories: chatHistories,
      extractModel,
      lastMemory
    });

    // remove invalid key
    for (const key in arg) {
      const item = extractKeys.find((item) => item.key === key);
      if (!item) {
        delete arg[key];
      }
      if (arg[key] === '') {
        delete arg[key];
      }
    }

    // auto fill required fields
    extractKeys.forEach((item) => {
      if (item.required && arg[item.key] === undefined) {
        arg[item.key] = item.defaultValue || '';
      }
    });

    // auth fields
    let success = !extractKeys.find((item) => !(item.key in arg));
    // auth empty value
    if (success) {
      for (const key in arg) {
        const item = extractKeys.find((item) => item.key === key);
        if (!item) {
          success = false;
          break;
        }
      }
    }

    const { totalPoints, modelName } = formatModelChars2Points({
      model: extractModel.model,
      inputTokens: inputTokens,
      outputTokens: outputTokens
    });
    props.usagePush([
      {
        moduleName: name,
        totalPoints: usedUserOpenAIKey ? 0 : totalPoints,
        model: modelName,
        inputTokens,
        outputTokens
      }
    ]);

    return {
      data: {
        [NodeOutputKeyEnum.success]: success,
        [NodeOutputKeyEnum.contextExtractFields]: JSON.stringify(arg),
        ...arg
      },
      [DispatchNodeResponseKeyEnum.memories]: {
        [memoryKey]: arg
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints: usedUserOpenAIKey ? 0 : totalPoints,
        model: modelName,
        query: content,
        inputTokens,
        outputTokens,
        extractDescription: description,
        extractResult: arg,
        contextTotalLen: chatHistories.length + 2
      }
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
}

const getJsonSchema = ({ params: { extractKeys } }: ActionProps) => {
  const properties: Record<string, JsonSchemaPropertiesItemType> = {};
  extractKeys.forEach((item) => {
    const jsonSchema = item.valueType
      ? valueTypeJsonSchemaMap[item.valueType] || toolValueTypeList[0].jsonSchema
      : toolValueTypeList[0].jsonSchema;

    properties[item.key] = {
      ...jsonSchema,
      description: item.desc,
      ...(item.enum ? { enum: item.enum.split('\n').filter(Boolean) } : {})
    };
  });

  return properties;
};

const completions = async (props: ActionProps) => {
  const {
    extractModel,
    externalProvider,
    histories,
    lastMemory,
    params: { content, description }
  } = props;

  const messages: ChatItemMiniType[] = [
    {
      obj: ChatRoleEnum.System,
      value: [
        {
          text: {
            content: getExtractJsonPrompt({
              systemPrompt: description,
              memory: lastMemory ? JSON.stringify(lastMemory) : undefined,
              schema: JSON.stringify(getJsonSchema(props))
            })
          }
        }
      ]
    },
    ...histories,
    {
      obj: ChatRoleEnum.Human,
      value: [
        {
          text: {
            content
          }
        }
      ]
    }
  ];

  const {
    requestId,
    finish_reason: finishReason,
    answerText: answer,
    usage: { inputTokens, outputTokens, usedUserOpenAIKey }
  } = await createLLMResponse({
    body: {
      model: extractModel.model,
      messages: chats2GPTMessages({ messages, reserveId: false, reserveReason: false }),
      stream: true
    },
    userKey: externalProvider.openaiAccount
  });

  // parse response
  const jsonStr = sliceJsonStr(answer);

  logger.debug('Content extract LLM response received', {
    requestId,
    model: extractModel.model,
    finishReason,
    answerLength: answer.length,
    jsonLength: jsonStr.length,
    inputTokens,
    outputTokens
  });

  if (!jsonStr) {
    logger.warn('Content extract result has no JSON content', {
      requestId,
      model: extractModel.model,
      finishReason,
      answerLength: answer.length,
      inputTokens,
      outputTokens
    });

    return {
      rawResponse: answer,
      inputTokens,
      outputTokens,
      usedUserOpenAIKey,
      arg: {}
    };
  }

  try {
    const arg = json5.parse(jsonStr);
    if (!arg || typeof arg !== 'object' || Array.isArray(arg)) {
      logger.warn('Content extract result is not an object', {
        requestId,
        model: extractModel.model,
        finishReason,
        answerLength: answer.length,
        jsonLength: jsonStr.length,
        resultType: Array.isArray(arg) ? 'array' : typeof arg
      });

      return {
        rawResponse: answer,
        inputTokens,
        outputTokens,
        usedUserOpenAIKey,
        arg: {}
      };
    }

    return {
      rawResponse: answer,
      inputTokens,
      outputTokens,
      usedUserOpenAIKey,
      arg: arg as Record<string, any>
    };
  } catch (error) {
    logger.warn('Failed to parse extract result', {
      requestId,
      model: extractModel.model,
      finishReason,
      answerLength: answer.length,
      jsonLength: jsonStr.length,
      error
    });
    return {
      rawResponse: answer,
      inputTokens,
      outputTokens,
      usedUserOpenAIKey,
      arg: {}
    };
  }
};
