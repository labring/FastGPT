import { calculateModelPrice } from '@fastgpt/global/core/ai/model/pricing';
import type { AIModelDataType } from '@fastgpt/global/core/ai/model/schema';

/** Token/TTS 数量统一按百万单价计费并返回模型 ID；分母由模型类型确定。 */
export const formatModelChars2Points = ({
  model,
  inputTokens = 0,
  outputTokens = 0
}: {
  model: AIModelDataType;
  inputTokens?: number;
  outputTokens?: number;
}) => {
  const { totalPoints } = calculateModelPrice({
    config: model,
    inputTokens,
    outputTokens
  });

  return {
    modelId: model.modelId,
    totalPoints
  };
};
