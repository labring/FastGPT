import { calculateModelPrice } from '@fastgpt/global/core/ai/model/pricing';
import type { AIModelDataType } from '@fastgpt/global/core/ai/model/schema';

/** Token/TTS 数量统一按百万单价计费并返回模型 ID；STT 调用方显式传入 60 秒。 */
export const formatModelChars2Points = ({
  model,
  inputTokens = 0,
  outputTokens = 0,
  multiple = 1000000
}: {
  model: AIModelDataType;
  inputTokens?: number;
  outputTokens?: number;
  multiple?: number;
}) => {
  const { totalPoints } = calculateModelPrice({
    config: model,
    inputTokens,
    outputTokens,
    multiple
  });

  return {
    modelId: model.modelId,
    totalPoints
  };
};
