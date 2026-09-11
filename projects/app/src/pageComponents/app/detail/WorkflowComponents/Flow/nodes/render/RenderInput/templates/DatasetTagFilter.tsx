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
import { WorkflowActionsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';
import { useReference } from './Reference';
import DatasetTagFilterRows, {
  DatasetTagFilterDeprecated,
  DatasetTagFilterUpgradeButton,
  TagFilterLogicToggle
} from '@/components/core/dataset/DatasetTagFilterRows';
import { WorkflowBufferDataContext } from '../../../../../context/workflowInitContext';
import { AppContext } from '@/pageComponents/app/detail/context';
import { getEditorVariables } from '@/pageComponents/app/detail/WorkflowComponents/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useTranslation } from 'next-i18next';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DatasetSearchModule } from '@fastgpt/global/core/workflow/template/system/datasetSearch';
import { WorkflowUtilsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowUtilsContext';
import {
  datasetSearchUsesLegacyFilter,
  persistLegacyDatasetSearchNodeUpgrade
} from '@/web/core/workflow/datasetSearchNodeUpgrade';

const DatasetTagFilterRender = ({ inputs = [], item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const { getNodeById, edges } = useContextSelector(WorkflowBufferDataContext, (v) => v);
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const { feConfigs } = useSystemStore();
  const isLegacyNode = datasetSearchUsesLegacyFilter(inputs);

  const { referenceList } = useReference({
    nodeId,
    valueType: WorkflowIOValueTypeEnum.any
  });
  const datasetIds = useMemo(() => {
    const datasetValue = inputs.find(
      (input) => input.key === NodeInputKeyEnum.datasetSelectList
    )?.value;
    if (!Array.isArray(datasetValue)) return [];
    return datasetValue
      .map((dataset) =>
        dataset && typeof dataset === 'object' && 'datasetId' in dataset
          ? String(dataset.datasetId ?? '')
          : ''
      )
      .filter(Boolean);
  }, [inputs]);

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
      })) ?? []
    );
  }, [feConfigs?.externalProviderWorkflowVariables]);

  const allVariables = useMemo(
    () => [...(editorVariables ?? []), ...externalVariables],
    [editorVariables, externalVariables]
  );

  const onChange = useCallback(
    (value: DatasetTagFilterValue | string) => {
      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: item.key,
        value: { ...item, value }
      });
    },
    [item, nodeId, onChangeNode]
  );

  if (isLegacyNode) {
    return (
      <DatasetTagFilterDeprecated
        value={normalizeLegacyDatasetTagFilterValue(item.value)}
        onChange={onChange}
        variables={allVariables}
        variableLabels={editorVariables}
      />
    );
  }

  return (
    <DatasetTagFilterRows
      value={item.value}
      onChange={onChange}
      datasetIds={datasetIds}
      referenceList={referenceList}
    />
  );
};

/** 标题右侧组件：新版显示 AND/OR 切换；旧版显示「已弃用，升级到最新版本」 */
export const DatasetTagFilterLogic = React.memo(function DatasetTagFilterLogic({
  inputs = [],
  item,
  nodeId
}: RenderInputProps) {
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const flowData2StoreData = useContextSelector(WorkflowUtilsContext, (v) => v.flowData2StoreData);
  const { appDetail, onSaveApp } = useContextSelector(AppContext, (v) => v);
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
          const workflow = flowData2StoreData();
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
                chatConfig: appDetail.chatConfig
              }),
            commit: (upgradedNode) =>
              onChangeNode({
                nodeId,
                type: 'attr',
                key: 'inputs',
                value: upgradedNode.inputs
              })
          });
        }}
      />
    );
  }

  return (
    <TagFilterLogicToggle
      value={isDatasetTagFilterValue(item.value) ? item.value : createEmptyTagFilterValue()}
      onChange={(value) => {
        onChangeNode({
          nodeId,
          type: 'updateInput',
          key: item.key,
          value: { ...item, value }
        });
      }}
    />
  );
});

export default React.memo(DatasetTagFilterRender);
