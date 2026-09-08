import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { isEmptyModelValue } from '@fastgpt/global/core/ai/modelReference';
import { useCallback } from 'react';
import { getModelDetail, type ModelFilter } from './modelData';
import { useModelQuery } from './useModelQuery';

/** 能力消费者就近读取已选模型；不要求父组件传目录，不将详情缺失替换为默认模型。 */
export const useModelDetail = <T extends ModelTypeEnum = ModelTypeEnum>({
  modelId,
  model,
  modelType,
  vision,
  excludeHidden,
  outLinkAuthData
}: ModelFilter<T> & { modelId?: string | null; model?: string | null }) => {
  const shareId = outLinkAuthData?.shareId;
  const outLinkUid = outLinkAuthData?.outLinkUid;
  const read = useCallback(
    () =>
      getModelDetail({
        modelId,
        model,
        modelType,
        vision,
        excludeHidden,
        outLinkAuthData: shareId && outLinkUid ? { shareId, outLinkUid } : undefined
      }),
    [modelId, model, modelType, vision, excludeHidden, shareId, outLinkUid]
  );
  const state = useModelQuery({
    enabled: !isEmptyModelValue(modelId) || !isEmptyModelValue(model),
    queryKey: JSON.stringify([modelId, model, modelType, vision, excludeHidden]),
    read,
    outLinkAuthData
  });
  return { ...state, model: state.data };
};
