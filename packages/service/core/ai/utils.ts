import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  StreamChatType
} from '@fastgpt/global/core/ai/type';
import { getLLMModel } from './model';

/* 
  Count response max token
*/
export const computedMaxToken = ({
  maxToken,
  model
}: {
  maxToken?: number;
  model: LLMModelItemType;
}) => {
  if (maxToken === undefined) return;

  maxToken = Math.min(maxToken, model.maxResponse);
  return maxToken;
};

// FastGPT temperature range: [0,10], ai temperature:[0,2],{0,1]……
export const computedTemperature = ({
  model,
  temperature
}: {
  model: LLMModelItemType;
  temperature: number;
}) => {
  if (typeof model.maxTemperature !== 'number') return undefined;
  temperature = +(model.maxTemperature * (temperature / 10)).toFixed(2);
  temperature = Math.max(temperature, 0.01);

  return temperature;
};

type CompletionsBodyType =
  | ChatCompletionCreateParamsNonStreaming
  | ChatCompletionCreateParamsStreaming;
type InferCompletionsBody<T> = T extends { stream: true }
  ? ChatCompletionCreateParamsStreaming
  : T extends { stream: false }
    ? ChatCompletionCreateParamsNonStreaming
    : ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming;

export const llmCompletionsBodyFormat = <T extends CompletionsBodyType>(
  body: T & {
    response_format?: any;
    json_schema?: string;
    stop?: string;
  },
  model: string | LLMModelItemType
): InferCompletionsBody<T> => {
  const modelData = typeof model === 'string' ? getLLMModel(model) : model;
  if (!modelData) {
    return body as unknown as InferCompletionsBody<T>;
  }

  const response_format = body.response_format;
  const json_schema = body.json_schema ?? undefined;
  const stop = body.stop ?? undefined;

  const requestBody: T = {
    ...body,
    temperature:
      typeof body.temperature === 'number'
        ? computedTemperature({
            model: modelData,
            temperature: body.temperature
          })
        : undefined,
    ...modelData?.defaultConfig,
    response_format: response_format
      ? {
          type: response_format,
          json_schema
        }
      : undefined,
    stop: stop?.split('|')
  };

  // field map
  if (modelData.fieldMap) {
    Object.entries(modelData.fieldMap).forEach(([sourceKey, targetKey]) => {
      // @ts-ignore
      requestBody[targetKey] = body[sourceKey];
      // @ts-ignore
      delete requestBody[sourceKey];
    });
  }

  return requestBody as unknown as InferCompletionsBody<T>;
};

export const llmStreamResponseToText = async (response: StreamChatType) => {
  let answer = '';
  for await (const part of response) {
    const content = part.choices?.[0]?.delta?.content || '';
    answer += content;
  }
  return answer;
};
