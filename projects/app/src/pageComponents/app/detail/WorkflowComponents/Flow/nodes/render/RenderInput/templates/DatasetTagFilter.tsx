import React, { useCallback, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { useContextSelector } from 'use-context-selector';
import { Button } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  createEmptyTagFilterValue,
  getNextDatasetTagFilterValue,
  isDatasetTagFilterOpen,
  normalizeLegacyDatasetTagFilterValue,
  type DatasetTagFilterValue
} from '@fastgpt/global/core/dataset/search/tagFilter';
import { getSelectedInputRenderType } from '@fastgpt/global/common/workflow/reference';
import { useReference } from './Reference';
import { getStaticDatasetIds } from './SelectDatasetParams.utils';
import DatasetTagFilterRows, {
  DatasetTagFilterDeprecated,
  DatasetTagFilterUpgradeButton
} from '@/components/core/dataset/DatasetTagFilterRows';
import { AppContext } from '@/pageComponents/app/detail/context';
import { getEditorVariables } from '@/pageComponents/app/detail/WorkflowComponents/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { DatasetSearchModule } from '@fastgpt/global/core/workflow/template/system/datasetSearch';
import { useField, useFieldActions } from '@/web/core/workflow/editor/react/useField';
import { useNode, useNodeActions } from '@/web/core/workflow/editor/react/useNode';
import { WorkflowFieldScope } from '@/web/core/workflow/editor/WorkflowFieldScope';
import { useWorkflowPersistence } from '@/web/core/workflow/editor/session/workflowSession';
import { useNodeWorkflowDocument } from '../../useWorkflowDocument';
import {
  datasetSearchUsesLegacyFilter,
  upgradeLegacyDatasetSearchInputs
} from '@/web/core/workflow/datasetSearchNodeUpgrade';

const DatasetTagFilterRender = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const nodeInputs = useNode<FlowNodeItemType['inputs']>(nodeId, (node) => node?.data.inputs) ?? [];
  const currentInput = nodeInputs.find((input) => input.key === item.key);
  const datasetSelectInput = nodeInputs.find(
    (input) => input.key === NodeInputKeyEnum.datasetSelectList
  );
  const fieldActions = useFieldActions({ nodeId, fieldKey: item.key, kind: 'input' });
  // 变量列表只读本节点与其上游来源闭包：窄订阅让无关字段的提交不重算也不重渲染。
  const { workflow, getNodeById, graph } = useNodeWorkflowDocument({ nodeId });
  const { feConfigs } = useSystemStore();
  const isLegacyNode = datasetSearchUsesLegacyFilter(nodeInputs);

  const { referenceList } = useReference({
    nodeId,
    valueType: WorkflowIOValueTypeEnum.any
  });
  const datasetIds = useMemo(() => getStaticDatasetIds(datasetSelectInput), [datasetSelectInput]);

  const editorVariables = useMemoEnhance(() => {
    if (!workflow || !graph) return [];
    return getEditorVariables({
      nodeId,
      getNodeById,
      chatConfig: workflow.chatConfig,
      t,
      getSourceNodeIds: (sourceNodeId) => graph.getSourceNodeIds({ nodeId: sourceNodeId })
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
      fieldActions.setValue(value);
    },
    [fieldActions]
  );

  if (!currentInput) return null;

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

/** 标题右侧组件：旧版显示升级按钮；新版显示开启/关闭按钮 */
export const DatasetTagFilterLogic = React.memo(function DatasetTagFilterLogic({
  item,
  nodeId
}: RenderInputProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fieldInput = useField(
    { nodeId, fieldKey: item.key, kind: 'input' },
    (field) => field?.data.input
  );
  const fieldActions = useFieldActions({ nodeId, fieldKey: item.key, kind: 'input' });
  const nodeActions = useNodeActions(nodeId);
  const { createSaveRequest, isCurrentSaveRequest, markSaved } = useWorkflowPersistence();
  // 只订阅真正读到的两个字段：AppContext 值随 currentTab / appLatestVersion / loadingApp 变化，
  // 整体订阅会让切 tab 也重渲染本节点组件。
  const appId = useContextSelector(AppContext, (v) => v.appId);
  const onSaveApp = useContextSelector(AppContext, (v) => v.onSaveApp);
  const nodeInputs = useNode<FlowNodeItemType['inputs']>(nodeId, (node) => node?.data.inputs) ?? [];
  const isLegacyNode = datasetSearchUsesLegacyFilter(nodeInputs);

  if (!fieldInput) return null;

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
            valueDesc:
              DatasetSearchModule.inputs.find((input) => input.key === item.key)?.valueDesc ??
              item.valueDesc,
            value: {
              ...createEmptyTagFilterValue(),
              open: true
            }
          };
          // 先登记升级的 revision，使失败时可以精确撤销这笔操作。
          const committed = nodeActions?.updateNode((current) => ({
            inputs: upgradeLegacyDatasetSearchInputs({
              inputs: current.inputs,
              filterInput: upgradedInput
            })
          }));
          if (!committed?.ok) {
            throw new Error(committed?.error?.message ?? 'Workflow data is unavailable');
          }

          const request = createSaveRequest(appId);
          // 恢复工作流时先保留本地升级，等待顶部保存按钮确认整份内容。
          if (!request) return;
          try {
            const saved = await onSaveApp({ ...request.data, isPublish: false }, request);
            if (saved) {
              markSaved(request);
              return;
            }
          } catch {
            // 升级按钮在提交 Runtime 后立即卸载，保存失败由这里处理。
          }
          if (!isCurrentSaveRequest(request)) return;
          if (
            committed.change &&
            request.runtime.getSavepoint().contentRevision === request.contentRevision
          ) {
            request.runtime.undo();
          }
          toast({ title: t('common:save_failed'), status: 'error' });
        }}
      />
    );
  }

  const isOpen = isDatasetTagFilterOpen(fieldInput.value);

  const handleToggle = () => {
    const nextValue = getNextDatasetTagFilterValue({
      value: fieldInput.value,
      isReference: getSelectedInputRenderType(item) === FlowNodeInputTypeEnum.reference,
      open: !isOpen
    });

    fieldActions.setValue(nextValue);
  };

  return (
    <MyTooltip
      label={
        isOpen ? t('workflow:tag_filter_close_tooltip') : t('workflow:tag_filter_open_tooltip')
      }
    >
      <Button
        className={'nodrag'}
        variant={'transparentBase'}
        iconSpacing={1}
        size={'sm'}
        mr={'-5px'}
        color={'myGray.600'}
        onClick={handleToggle}
      >
        {isOpen ? t('app:sandbox_enable') : t('app:sandbox_disable')}
      </Button>
    </MyTooltip>
  );
});

export default React.memo(DatasetTagFilterRender);
