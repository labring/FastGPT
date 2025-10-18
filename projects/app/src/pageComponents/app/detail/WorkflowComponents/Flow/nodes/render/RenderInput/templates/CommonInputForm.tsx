import React, { useCallback, useEffect, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import InputRender from '@/components/core/app/formRender';
import { nodeInputTypeToInputType } from '@/components/core/app/formRender/utils';
import { WorkflowDataContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useCreation } from 'ahooks';
import { getEditorVariables } from '@/pageComponents/app/detail/WorkflowComponents/utils';
import { InputTypeEnum } from '@/components/core/app/formRender/constant';
import { llmModelTypeFilterMap } from '@fastgpt/global/core/ai/constants';
import { getWebDefaultLLMModel } from '@/web/common/system/utils';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import OptimizerPopover from '@/components/common/PromptEditor/OptimizerPopover';
import { WorkflowActionsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';

const CommonInputForm = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const edges = useContextSelector(WorkflowDataContext, (v) => v.edges);
  const nodeList = useContextSelector(WorkflowDataContext, (v) => v.nodeList);
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
      // 添加长度验证（针对提示词字段）
      if (typeof value === 'string' && value.length > 100000) {
        console.warn('Input value too long:', value.length);
        return;
      }

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
    // 移除异步的handleChange调用，避免状态冲突
    if (inputType === InputTypeEnum.selectLLMModel) {
      // 如果有默认值且当前值为undefined，使用默认值
      if (item.value === undefined && defaultModel) {
        return defaultModel;
      }
      return item.value || defaultModel;
    }

    // 对于其他类型，直接返回当前值
    return item.value;
  }, [inputType, item.value, defaultModel]); // 移除handleChange依赖

  // 添加默认值处理的效果
  useEffect(() => {
    if (inputType === InputTypeEnum.selectLLMModel && item.value === undefined && defaultModel) {
      handleChange(defaultModel);
    }
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
