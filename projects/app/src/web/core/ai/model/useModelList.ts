import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { useCallback } from 'react';
import { getModelList, type ModelFilter } from './modelData';
import { useModelQuery } from './useModelQuery';

/** 候选展示业务自行启用目录读取；默认不加载，选择器展开时显式 enabled。 */
export const useModelList = <T extends ModelTypeEnum = ModelTypeEnum>({
  enabled = false,
  modelType,
  vision,
  excludeHidden,
  outLinkAuthData
}: ModelFilter<T> & { enabled?: boolean } = {}) => {
  const shareId = outLinkAuthData?.shareId;
  const outLinkUid = outLinkAuthData?.outLinkUid;
  const read = useCallback(
    () =>
      getModelList({
        modelType,
        vision,
        excludeHidden,
        refresh: true,
        outLinkAuthData: shareId && outLinkUid ? { shareId, outLinkUid } : undefined
      }),
    [modelType, vision, excludeHidden, shareId, outLinkUid]
  );
  const state = useModelQuery({
    enabled,
    observeCatalog: false,
    queryKey: JSON.stringify(['list', modelType, vision, excludeHidden]),
    read,
    outLinkAuthData
  });
  return { ...state, modelList: state.data ?? [] };
};
