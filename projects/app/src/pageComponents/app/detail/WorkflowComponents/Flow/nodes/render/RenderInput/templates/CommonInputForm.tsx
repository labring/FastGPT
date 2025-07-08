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

const CommonInputForm = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const { feConfigs } = useSystemStore();

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

  return (
    <InputRender
      inputType={inputType}
      value={item.value}
      onChange={handleChange}
      placeholder={item.placeholder}
      maxLength={item.maxLength}
      variables={[...(editorVariables || []), ...(externalVariables || [])]}
      variableLabels={editorVariables}
      min={item.min}
      max={item.max}
      list={item.list}
    />
  );
};

export default React.memo(CommonInputForm);
