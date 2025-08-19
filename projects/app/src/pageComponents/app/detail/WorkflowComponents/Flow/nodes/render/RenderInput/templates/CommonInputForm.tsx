import React, { useCallback, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pageComponents/app/detail/WorkflowComponents/context';
import InputRender from '@/components/core/app/formRender';
import { nodeInputTypeToInputType } from '@/components/core/app/formRender/utils';
import { WorkflowNodeEdgeContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useCreation } from 'ahooks';
import { getEditorVariables } from '@/pageComponents/app/detail/WorkflowComponents/utils';
import { InputTypeEnum } from '@/components/core/app/formRender/constant';
import { llmModelTypeFilterMap } from '@fastgpt/global/core/ai/constants';
import { getWebDefaultLLMModel } from '@/web/common/system/utils';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import OptimizerPopover from '@/components/common/PromptEditor/OptimizerPopover';

const CommonInputForm = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const { feConfigs, llmModelList } = useSystemStore();

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
    return getWebDefaultLLMModel(modelList).model;
  }, [modelList]);

  const editorVariables = useCreation(() => {
    return getEditorVariables({
      nodeId,
      nodeList,
      edges,
      appDetail,
      t
    });
  }, [nodeId, nodeList, edges, appDetail, t]);

  const externalVariables = useMemo(() => {
    return (
      feConfigs?.externalProviderWorkflowVariables?.map((item) => ({
        key: item.key,
        label: item.name
      })) || []
    );
  }, [feConfigs?.externalProviderWorkflowVariables]);

  const handleChange = useCallback(
    (value: any) => {
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: item.key,
        value: { ...item, value }
      });
    },
    [item, nodeId, onChangeNode]
  );

  const inputType = nodeInputTypeToInputType(item.renderTypeList);
  const value = useMemo(() => {
    if (inputType === InputTypeEnum.selectLLMModel) {
      if (item.value === undefined && defaultModel) {
        handleChange(defaultModel);
      }
      return item.value || defaultModel;
    }
    return item.value;
  }, [inputType, item.value, defaultModel, handleChange]);

  const canOptimizePrompt = item.key === NodeInputKeyEnum.aiSystemPrompt;
  const OptimizerPopverComponent = useCallback(
    ({ iconButtonStyle }: { iconButtonStyle: Record<string, any> }) => {
      return (
        <OptimizerPopover
          iconButtonStyle={iconButtonStyle}
          defaultPrompt={item.value}
          onChangeText={(e) => {
            handleChange(e);
          }}
        />
      );
    },
    [item.value, handleChange]
  );

  return (
    <InputRender
      inputType={inputType}
      value={value}
      onChange={handleChange}
      placeholder={item.placeholder}
      maxLength={item.maxLength}
      variables={[...(editorVariables || []), ...(externalVariables || [])]}
      variableLabels={editorVariables}
      min={item.min}
      max={item.max}
      list={item.list}
      modelList={modelList}
      ExtensionPopover={canOptimizePrompt ? [OptimizerPopverComponent] : undefined}
    />
  );
};

export default React.memo(CommonInputForm);
