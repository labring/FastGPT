import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam
} from '@fastgpt/global/core/ai/type';
import { countGptMessagesTokens } from '../../common/string/tiktoken';
import { getLLMModel } from './model';

export const computedMaxToken = async ({
  maxToken,
  model,
  filterMessages = []
}: {
  maxToken: number;
  model: LLMModelItemType;
  filterMessages: ChatCompletionMessageParam[];
}) => {
  maxToken = Math.min(maxToken, model.maxResponse);
  const tokensLimit = model.maxContext;

  /* count response max token */
  const promptsToken = await countGptMessagesTokens(filterMessages);
  maxToken = promptsToken + maxToken > tokensLimit ? tokensLimit - promptsToken : maxToken;

  if (maxToken <= 0) {
    maxToken = 200;
  }
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
  if (temperature < 1) return temperature;

  temperature = +(model.maxTemperature * (temperature / 10)).toFixed(2);
  temperature = Math.max(temperature, 0.01);

  return temperature;
};

type CompletionsBodyType =
  | ChatCompletionCreateParamsNonStreaming
  | ChatCompletionCreateParamsStreaming;
type InferCompletionsBody<T> = T extends { stream: true }
  ? ChatCompletionCreateParamsStreaming
  : ChatCompletionCreateParamsNonStreaming;

export const llmCompletionsBodyFormat = <T extends CompletionsBodyType>(
  body: T,
  model: string | LLMModelItemType
): InferCompletionsBody<T> => {
  const modelData = typeof model === 'string' ? getLLMModel(model) : model;
  if (!modelData) {
    return body as InferCompletionsBody<T>;
  }

  const requestBody: T = {
    ...body,
    temperature: body.temperature
      ? computedTemperature({
          model: modelData,
          temperature: body.temperature
        })
      : undefined,
    ...modelData?.defaultConfig
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

  // console.log(requestBody);

  return requestBody as InferCompletionsBody<T>;
};
