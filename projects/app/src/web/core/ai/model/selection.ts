import type { MyLLMModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';

/** 未配置/不可用模型时只放宽客户端编辑上限，后端仍校验实际模型限制。 */
export const UNAVAILABLE_MODEL_TOKEN_LIMIT = 1_000_000;

/** 仅使用真实已选模型的引用额度；不按默认模型推断未配置/失效模型的能力。 */
export const getModelQuoteTokenLimit = (model?: Pick<MyLLMModelItemType, 'isActive' | 'config'>) =>
  !model || model.isActive === false ? UNAVAILABLE_MODEL_TOKEN_LIMIT : model.config.quoteMaxToken;
