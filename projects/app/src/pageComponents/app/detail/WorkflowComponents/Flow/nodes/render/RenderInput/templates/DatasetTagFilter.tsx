import React, { useCallback, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { useContextSelector } from 'use-context-selector';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  createEmptyTagFilterValue,
  isDatasetTagFilterValue,
  normalizeLegacyDatasetTagFilterValue,
  type DatasetTagFilterValue
} from '@fastgpt/global/core/dataset/workflowTagFilter';
import { useReference } from './Reference';
import DatasetTagFilterRows, {
  DatasetTagFilterDeprecated,
  DatasetTagFilterUpgradeButton,
  TagFilterLogicToggle
} from '@/components/core/dataset/DatasetTagFilterRows';
import { AppContext } from '@/pageComponents/app/detail/context';
import { getEditorVariables } from '@/pageComponents/app/detail/WorkflowComponents/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useTranslation } from 'next-i18next';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DatasetSearchModule } from '@fastgpt/global/core/workflow/template/system/datasetSearch';
import { useField, useNodeActions } from '@/web/core/workflow/editor';
import { WorkflowFieldScope } from '@/web/core/workflow/editor/WorkflowFieldScope';
import { WorkflowHostContext } from '@/web/core/workflow/editor/host';
import { useNodeWorkflowDocument } from '../../useWorkflowDocument';
import {
  datasetSearchUsesLegacyFilter,
  persistLegacyDatasetSearchNodeUpgrade
} from '@/web/core/workflow/datasetSearchNodeUpgrade';

const DatasetTagFilterRender = ({ inputs = [], item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const field = useField(nodeId, item.key, 'input');
  const currentInput = field?.data.input ?? item;
  const datasetSelectField = useField(nodeId, NodeInputKeyEnum.datasetSelectList, 'input');
  const datasetSelectInput =
    datasetSelectField?.data.input ??
    inputs.find((input) => input.key === NodeInputKeyEnum.datasetSelectList);
  // 变量列表只读本节点与其上游来源闭包：窄订阅让无关字段的提交不重算也不重渲染。
  const { workflow, getNodeById, graph } = useNodeWorkflowDocument({ nodeId });
  const { feConfigs } = useSystemStore();
  const isLegacyNode = datasetSearchUsesLegacyFilter(inputs);

  const { referenceList } = useReference({
    nodeId,
    valueType: WorkflowIOValueTypeEnum.any
  });
  const datasetIds = useMemo(() => {
    const datasetValue = datasetSelectInput?.value;
    if (!Array.isArray(datasetValue)) return [];
    return datasetValue
      .map((dataset) =>
        dataset && typeof dataset === 'object' && 'datasetId' in dataset
          ? String(dataset.datasetId ?? '')
          : ''
      )
      .filter(Boolean);
  }, [datasetSelectInput?.value]);

  const editorVariables = useMemoEnhance(() => {
    if (!workflow) return [];
    return getEditorVariables({
      nodeId,
      getNodeById,
      edges: workflow.edges,
      chatConfig: workflow.chatConfig,
      t,
      getIncomingEdges: graph?.getIncomingEdges
    });
  }, [nodeId, workflow, getNodeById, graph, t]);

  const externalVariables = useMemo(() => {
    return (
      feConfigs?.externalProviderWorkflowVariables?.map((item) => ({
        key: item.key,
        label: item.name
      })) ?? []
    );
  }, [feConfigs?.externalProviderWorkflowVariables]);

  const allVariables = useMemo(
    () => [...(editorVariables ?? []), ...externalVariables],
    [editorVariables, externalVariables]
  );

  const onChange = useCallback(
    (value: DatasetTagFilterValue | string) => {
      field?.setValue(value);
    },
    [field]
  );

  if (isLegacyNode) {
    return (
      <WorkflowFieldScope nodeId={nodeId} fieldKey={item.key}>
        <DatasetTagFilterDeprecated
          value={normalizeLegacyDatasetTagFilterValue(currentInput.value)}
          onChange={onChange}
          variables={allVariables}
          variableLabels={editorVariables}
        />
      </WorkflowFieldScope>
    );
  }

  return (
    <WorkflowFieldScope nodeId={nodeId} fieldKey={item.key}>
      <DatasetTagFilterRows
        value={currentInput.value}
        onChange={onChange}
        datasetIds={datasetIds}
        referenceList={referenceList}
      />
    </WorkflowFieldScope>
  );
};

/** 标题右侧组件：新版显示 AND/OR 切换；旧版显示「已弃用，升级到最新版本」 */
export const DatasetTagFilterLogic = React.memo(function DatasetTagFilterLogic({
  inputs = [],
  item,
  nodeId
}: RenderInputProps) {
  const field = useField(nodeId, item.key, 'input');
  const currentInput = field?.data.input ?? item;
  const nodeActions = useNodeActions(nodeId);
  /** 升级要先持久化整份工作流，出站序列化直接读 host。 */
  const serializeWorkflow = useContextSelector(WorkflowHostContext, (v) => v.serializeWorkflow);
  // 只订阅真正读到的两个字段：AppContext 值随 currentTab / appLatestVersion / loadingApp 变化，
  // 整体订阅会让切 tab 也重渲染本节点组件。
  const onSaveApp = useContextSelector(AppContext, (v) => v.onSaveApp);
  const isLegacyNode = datasetSearchUsesLegacyFilter(inputs);

  if (isLegacyNode) {
    return (
      <DatasetTagFilterUpgradeButton
        onUpgrade={async () => {
          const upgradedInput = {
            ...item,
            renderTypeList: [
              FlowNodeInputTypeEnum.datasetTagFilter,
              FlowNodeInputTypeEnum.reference
            ],
            selectedType: FlowNodeInputTypeEnum.datasetTagFilter,
            label:
              DatasetSearchModule.inputs.find((input) => input.key === item.key)?.label ??
              item.label,
            description:
              DatasetSearchModule.inputs.find((input) => input.key === item.key)?.description ??
              item.description,
            value: createEmptyTagFilterValue()
          };
          const workflow = serializeWorkflow();
          if (!workflow) throw new Error('Workflow data is unavailable');
          await persistLegacyDatasetSearchNodeUpgrade({
            nodes: workflow.nodes,
            nodeId,
            filterInput: upgradedInput,
            persist: (nodes) =>
              onSaveApp({
                ...workflow,
                nodes,
                isPublish: false,
                chatConfig: workflow.chatConfig
              }),
            commit: (upgradedNode) =>
              // 持久化成功后再把升级结果写回文档：整份 inputs 替换，一次提交。
              nodeActions?.updateNode(() => ({ inputs: upgradedNode.inputs }))
          });
        }}
      />
    );
  }

  return (
    <TagFilterLogicToggle
      value={
        isDatasetTagFilterValue(currentInput.value)
          ? currentInput.value
          : createEmptyTagFilterValue()
      }
      onChange={(value) => {
        field?.setValue(value);
      }}
    />
  );
});

export default React.memo(DatasetTagFilterRender);
