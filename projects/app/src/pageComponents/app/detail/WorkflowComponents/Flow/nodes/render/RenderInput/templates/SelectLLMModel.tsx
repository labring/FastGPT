import React, { useCallback, useEffect, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { llmModelTypeFilterMap } from '@fastgpt/global/core/ai/constants';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pageComponents/app/detail/WorkflowComponents/context';

const SelectAiModelRender = ({ item, nodeId }: RenderInputProps) => {
  const { llmModelList, defaultModels } = useSystemStore();
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
  const defaultModel = useMemo(() => {
    if (defaultModels.llm && modelList.find((model) => model.model === defaultModels.llm?.model)) {
      return defaultModels.llm.model;
    }
    return modelList[0]?.model;
  }, [defaultModels.llm, modelList]);

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
    if (!modelList.find((model) => model.model === item.value) && !!defaultModel) {
      onChangeModel(defaultModel);
    }
  }, [defaultModel, item.value, modelList, onChangeModel]);

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
