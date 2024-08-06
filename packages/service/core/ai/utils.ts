import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { countGptMessagesTokens } from '../../common/string/tiktoken';

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
  temperature = +(model.maxTemperature * (temperature / 10)).toFixed(2);
  temperature = Math.max(temperature, 0.01);

  return temperature;
};
