import type {
  MyLLMModelItemType,
  MyModelItemType
} from '@fastgpt/global/openapi/core/ai/model/api';
import { isEmptyModelValue } from '@fastgpt/global/core/ai/modelReference';
import { findClientModelByValue } from './modelReference';

/** 未配置/不可用模型时只放宽客户端编辑上限，后端仍校验实际模型限制。 */
export const UNAVAILABLE_MODEL_TOKEN_LIMIT = 1_000_000;

/** 所有默认选择共用：当前可用范围内先选默认模型，再选首项；没有候选则保持未配置。 */
export const getDefaultModelSelection = <T extends Pick<MyModelItemType, 'modelId' | 'isActive'>>({
  models,
  defaultModelId
}: {
  models: T[];
  defaultModelId?: string;
}): T | undefined => {
  const availableModels = models.filter(
    (model) => model.isActive !== false && !isEmptyModelValue(model.modelId)
  );
  return availableModels.find((model) => model.modelId === defaultModelId) ?? availableModels[0];
};

/**
 * 计算需要写入实际状态的初始化值，禁止拿返回值直接做显示或请求 fallback。
 * 空值选有效默认模型或列表首项；非空旧名称仅精确转换，失效引用不擅自替换。
 */
export const getModelInitializationValue = ({
  value,
  models,
  defaultModelId
}: {
  value?: string | null;
  models: Pick<MyModelItemType, 'modelId' | 'model' | 'isActive'>[];
  defaultModelId?: string;
}) => {
  const availableModels = models.filter((model) => model.isActive !== false);
  if (!isEmptyModelValue(value)) {
    return findClientModelByValue({ models: availableModels, value: value ?? undefined })?.modelId;
  }
  return getDefaultModelSelection({ models: availableModels, defaultModelId })?.modelId;
};

/** 仅使用真实已选模型的引用额度；不按默认模型推断未配置/失效模型的能力。 */
export const getModelQuoteTokenLimit = (model?: Pick<MyLLMModelItemType, 'isActive' | 'config'>) =>
  !model || model.isActive === false ? UNAVAILABLE_MODEL_TOKEN_LIMIT : model.config.quoteMaxToken;
