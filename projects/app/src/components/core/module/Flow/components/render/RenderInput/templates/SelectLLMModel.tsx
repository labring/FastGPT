import React, { useCallback, useEffect } from 'react';
import type { RenderInputProps } from '../type';
import { onChangeNode } from '../../../../FlowProvider';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { llmModelTypeFilterMap } from '@fastgpt/global/core/ai/constants';
import AIModelSelector from '@/components/Select/AIModelSelector';

const SelectAiModelRender = ({ item, moduleId }: RenderInputProps) => {
  const { llmModelList } = useSystemStore();

  const modelList = llmModelList.filter((model) => {
    if (!item.llmModelType) return true;
    const filterField = llmModelTypeFilterMap[item.llmModelType];
    if (!filterField) return true;
    //@ts-ignore
    return !!model[filterField];
  });

  const onChangeModel = useCallback(
    (e: string) => {
      onChangeNode({
        moduleId,
        type: 'updateInput',
        key: item.key,
        value: {
          ...item,
          value: e
        }
      });
    },
    [item, moduleId]
  );

  useEffect(() => {
    if (!item.value && modelList.length > 0) {
      onChangeModel(modelList[0].model);
    }
  }, [item.value, modelList, onChangeModel]);

  return (
    <AIModelSelector
      minW={'350px'}
      width={'100%'}
      value={item.value}
      list={modelList.map((item) => ({
        value: item.model,
        label: item.name
      }))}
      onchange={onChangeModel}
    />
  );
};

export default React.memo(SelectAiModelRender);
