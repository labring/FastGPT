import React, { useCallback, useEffect, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { llmModelTypeFilterMap } from '@fastgpt/global/core/ai/constants';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';

const SelectAiModelRender = ({ item, nodeId }: RenderInputProps) => {
  const { llmModelList } = useSystemStore();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const modelList = useMemo(
    () =>
      llmModelList.filter((model) => {
        if (!item.llmModelType) return true;
        const filterField = llmModelTypeFilterMap[item.llmModelType];
        if (!filterField) return true;
        //@ts-ignore
        return !!model[filterField];
      }),
    [llmModelList, item.llmModelType]
  );

  const onChangeModel = useCallback(
    (e: string) => {
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: item.key,
        value: {
          ...item,
          value: e
        }
      });
    },
    [item, nodeId, onChangeNode]
  );

  useEffect(() => {
    if (!item.value && modelList.length > 0) {
      onChangeModel(modelList[0].model);
    }
  }, []);

  const Render = useMemo(() => {
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
  }, [item.value, modelList, onChangeModel]);

  return Render;
};

export default React.memo(SelectAiModelRender);
