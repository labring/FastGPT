import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { ModelDefaultIds } from '@fastgpt/global/core/ai/defaultModel';
import { useCallback } from 'react';
import { getModelDefault, type ModelFilter } from './modelData';
import { useModelQuery } from './useModelQuery';

/** 默认模型读取不赋值；业务必须显式启用，并在自己的初始化逻辑中检查当前值后写入。 */
export const useModelDefault = <T extends ModelTypeEnum>({
  enabled,
  modelType,
  vision,
  excludeHidden,
  businessDefaultModelId,
  defaultKey,
  outLinkAuthData
}: ModelFilter<T> & {
  enabled: boolean;
  modelType: T;
  businessDefaultModelId?: string;
  defaultKey?: keyof ModelDefaultIds;
}) => {
  const shareId = outLinkAuthData?.shareId;
  const outLinkUid = outLinkAuthData?.outLinkUid;
  const read = useCallback(
    () =>
      getModelDefault({
        modelType,
        vision,
        excludeHidden,
        businessDefaultModelId,
        defaultKey,
        outLinkAuthData: shareId && outLinkUid ? { shareId, outLinkUid } : undefined
      }),
    [modelType, vision, excludeHidden, businessDefaultModelId, defaultKey, shareId, outLinkUid]
  );
  const state = useModelQuery({
    enabled,
    queryKey: JSON.stringify([
      'default',
      modelType,
      vision,
      excludeHidden,
      businessDefaultModelId,
      defaultKey
    ]),
    read,
    outLinkAuthData
  });
  return { ...state, model: state.data };
};
