import OptimizerPopover from '@/components/common/PromptEditor/OptimizerPopover';
import InputRender from '@/components/core/app/formRender';
import { InputTypeEnum } from '@/components/core/app/formRender/constant';
import { nodeInputTypeToInputType } from '@/components/core/app/formRender/utils';
import { WorkflowActionsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';
import { WorkflowBufferDataContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowInitContext';
import { getEditorVariables } from '@/pageComponents/app/detail/WorkflowComponents/utils';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { isNestedParentNodeType } from '@fastgpt/global/core/workflow/node/constant';
import {
  getSelectedInputRenderType,
  workflowModelKeyMappings
} from '@fastgpt/global/core/workflow/utils';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useLocalStorageState } from 'ahooks';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import type { RenderInputProps } from '../type';

const CommonInputForm = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const { getNodeById, edges } = useContextSelector(WorkflowBufferDataContext, (v) => v);
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const { feConfigs } = useSystemStore();

  const [, setDefaultModel] = useLocalStorageState<string>('workflow_default_llm_model', {
    defaultValue: ''
  });

  const selectedRenderType = getSelectedInputRenderType(item);
  const inputType = nodeInputTypeToInputType(
    selectedRenderType ? [selectedRenderType] : item.renderTypeList
  );

  const editorVariables = useMemoEnhance(() => {
    return getEditorVariables({
      nodeId,
      getNodeById,
      edges,
      appDetail,
      t
    });
  }, [nodeId, getNodeById, edges, appDetail, t]);

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
      if (typeof value === 'string') {
        if (value.length > 1000000) {
          console.warn('Input value too long:', value.length);
          value = value.slice(0, 1000000);
        }
      }
      if (item.key === NodeInputKeyEnum.aiModel || item.key === NodeInputKeyEnum.aiModelId) {
        setDefaultModel(value);
      }

      const modelIdKey = workflowModelKeyMappings.find(
        ([legacyKey]) => legacyKey === item.key
      )?.[1];
      if (inputType === InputTypeEnum.selectLLMModel && modelIdKey) {
        onChangeNode({
          nodeId,
          type: 'replaceInput',
          key: item.key,
          value: { ...item, key: modelIdKey, value }
        });
        return;
      }

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: item.key,
        value: { ...item, value }
      });
    },
    [inputType, item, nodeId, onChangeNode, setDefaultModel]
  );

  // 嵌套容器节点（loop/parallelRun/loopRun）里的 select 下拉向上展开，避免被子节点覆盖。
  const menuPlacement = useMemo(() => {
    const node = getNodeById(nodeId);
    if (!node) return undefined;
    return isNestedParentNodeType(node.flowNodeType) ? ('top-start' as const) : undefined;
  }, [getNodeById, nodeId]);

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
      value={item.value}
      onChange={handleChange}
      variables={[...(editorVariables || []), ...(externalVariables || [])]}
      variableLabels={editorVariables}
      ExtensionPopover={canOptimizePrompt ? [OptimizerPopverComponent] : undefined}
      menuPlacement={menuPlacement}
      {...item}
    />
  );
};

export default React.memo(CommonInputForm);
