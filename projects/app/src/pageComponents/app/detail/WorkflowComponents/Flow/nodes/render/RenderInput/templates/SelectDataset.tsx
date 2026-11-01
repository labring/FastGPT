import React, { useCallback, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Box, Button, Flex, Grid, Switch, useDisclosure } from '@chakra-ui/react';
import { type SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useContextSelector } from 'use-context-selector';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  getSelectedInputRenderType,
  nodeInputIsReference
} from '@fastgpt/global/common/workflow/reference';
import type { DatasetTagFilterValue } from '@fastgpt/global/core/dataset/search/tagFilter';
import { WorkflowActionsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';
import { AppContext } from '@/pageComponents/app/detail/context';
import type { DatasetParamsModalFormType } from '@/components/core/app/DatasetParamsModal';
import DatasetCard from '@/components/core/app/DatasetCard';
import { useDatasetTagFilterPrune } from '@/components/core/dataset/DatasetTagFilterRows';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useWorkflowQuoteLimit } from '../../../../hooks/useWorkflowQuoteLimit';
import { useReference } from './Reference';
import { getDatasetSearchParamInputs, getDatasetSearchParams } from './SelectDatasetParams.utils';
import { chooseButtonTooltipProps } from '../../../NodeAgent/AgentInputs';

const DatasetSelectModal = dynamic(() => import('@/components/core/app/DatasetSelectModal'));
const DatasetParamsModal = dynamic(() => import('@/components/core/app/DatasetParamsModal'));

// Agent 节点将 datasetSimilarity 设为 hidden，使用紧凑卡片样式并将参数入口内联在标题右侧。
const hasInlineDatasetParamsInput = (inputs: RenderInputProps['inputs'] = []) => {
  const similarityInput = inputs.find((v) => v.key === NodeInputKeyEnum.datasetSimilarity);
  return Boolean(
    similarityInput && getSelectedInputRenderType(similarityInput) === FlowNodeInputTypeEnum.hidden
  );
};

export const SelectDatasetRender = React.memo(function SelectDatasetRender({
  inputs = [],
  item,
  nodeId
}: RenderInputProps) {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const hasInlineDatasetParams = useMemo(() => hasInlineDatasetParamsInput(inputs), [inputs]);

  const {
    isOpen: isOpenDatasetSelect,
    onOpen: onOpenDatasetSelect,
    onClose: onCloseDatasetSelect
  } = useDisclosure();

  const selectedDatasets = useMemo(() => {
    if (Array.isArray(item.value)) return item.value as SelectedDatasetType[];
    return [] as SelectedDatasetType[];
  }, [item.value]);

  const updateDatasets = useCallback(
    (nextDatasets: SelectedDatasetType[]) => {
      onChangeNode(
        getDatasetSearchParamInputs({ inputs, values: { datasets: nextDatasets } }).map(
          (input) => ({
            nodeId,
            type: 'updateInput',
            key: input.key,
            value: input
          })
        )
      );
    },
    [inputs, nodeId, onChangeNode]
  );

  const onDeleteDataset = useCallback(
    (datasetId: string) => {
      updateDatasets(selectedDatasets.filter((dataset) => dataset.datasetId !== datasetId));
    },
    [selectedDatasets, updateDatasets]
  );

  const Render = useMemo(() => {
    return (
      <>
        <Grid
          gridTemplateColumns={'repeat(2, minmax(0, 1fr))'}
          gridGap={hasInlineDatasetParams ? 3 : 4}
          minW={'350px'}
          w={'100%'}
        >
          {hasInlineDatasetParams ? (
            <MyTooltip label={t('common:core.chat.Select dataset')} {...chooseButtonTooltipProps}>
              <Button
                variant={'primaryOutline'}
                h={10}
                w={'100%'}
                leftIcon={<MyIcon name={'common/selectLight'} w={'14px'} />}
                data-dataset-select-trigger={nodeId}
                onClick={onOpenDatasetSelect}
              >
                {t('common:Choose')}
              </Button>
            </MyTooltip>
          ) : (
            <Button
              h={10}
              leftIcon={<MyIcon name={'common/selectLight'} w={'14px'} />}
              data-dataset-select-trigger={nodeId}
              onClick={onOpenDatasetSelect}
            >
              {t('common:Choose')}
            </Button>
          )}
          {selectedDatasets.map((dataset) => (
            <DatasetCard
              key={dataset.datasetId}
              dataset={dataset}
              flexProps={
                hasInlineDatasetParams
                  ? {
                      h: 10,
                      px: 3,
                      py: 2.5,
                      boxShadow: 'none'
                    }
                  : undefined
              }
              onDelete={onDeleteDataset}
            />
          ))}
        </Grid>
        {isOpenDatasetSelect && (
          <DatasetSelectModal
            defaultSelectedDatasets={selectedDatasets.map((item) => ({
              datasetId: item.datasetId,
              name: item.name,
              avatar: item.avatar,
              vectorModel: item.vectorModel,
              error: item.error
            }))}
            onChange={updateDatasets}
            onClose={onCloseDatasetSelect}
          />
        )}
      </>
    );
  }, [
    hasInlineDatasetParams,
    isOpenDatasetSelect,
    nodeId,
    onCloseDatasetSelect,
    onOpenDatasetSelect,
    onDeleteDataset,
    selectedDatasets,
    t,
    updateDatasets
  ]);

  return Render;
});

export const SwitchAuthTmb = React.memo(function SwitchAuthTmb({
  inputs = [],
  item,
  nodeId
}: RenderInputProps) {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const appId = useContextSelector(AppContext, (v) => v.appId);
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const llmMaxQuoteContext = useWorkflowQuoteLimit();
  const { referenceList } = useReference({
    nodeId,
    valueType: WorkflowIOValueTypeEnum.any
  });
  const {
    isOpen: isOpenDatasetParams,
    onOpen: onOpenDatasetParams,
    onClose: onCloseDatasetParams
  } = useDisclosure();

  const authTmbIdInput = useMemo(
    () => inputs.find((v) => v.key === NodeInputKeyEnum.authTmbId),
    [inputs]
  );
  const collectionFilterInput = useMemo(
    () => inputs.find((v) => v.key === NodeInputKeyEnum.collectionFilterMatch),
    [inputs]
  );
  const hasInlineDatasetParams = useMemo(() => hasInlineDatasetParamsInput(inputs), [inputs]);

  const datasetIds = useMemo(
    () =>
      !nodeInputIsReference(item) && Array.isArray(item.value)
        ? (item.value as SelectedDatasetType[]).map((dataset) => dataset?.datasetId).filter(Boolean)
        : [],
    [item]
  );

  // 参数编辑、权限开关和失效标签清理共用回写入口，旧嵌套配置同步由转换器处理。
  const onChangeDatasetParams = useCallback(
    (values: Partial<DatasetParamsModalFormType>) => {
      onChangeNode(
        getDatasetSearchParamInputs({ inputs, values }).map((input) =>
          inputs.some((item) => item.key === input.key)
            ? { nodeId, type: 'updateInput' as const, key: input.key, value: input }
            : { nodeId, type: 'addInput' as const, value: input }
        )
      );
    },
    [inputs, nodeId, onChangeNode]
  );
  const handlePruneTagFilter = useCallback(
    (collectionFilterMatch: DatasetTagFilterValue) =>
      onChangeDatasetParams({ collectionFilterMatch }),
    [onChangeDatasetParams]
  );

  useDatasetTagFilterPrune({
    datasetIds,
    value: collectionFilterInput?.value,
    onChange: handlePruneTagFilter
  });

  const datasetParams = useMemo(() => getDatasetSearchParams(inputs), [inputs]);

  const showAuthSwitch = Boolean(feConfigs?.isPlus && authTmbIdInput);
  if (!showAuthSwitch && !hasInlineDatasetParams) return null;

  return (
    <Flex className="nodrag" alignItems={'center'} gap={2}>
      {showAuthSwitch && authTmbIdInput && (
        <Flex alignItems={'center'}>
          <Box
            fontSize={hasInlineDatasetParams ? 'xs' : 'sm'}
            fontWeight={hasInlineDatasetParams ? 'medium' : undefined}
            color={hasInlineDatasetParams ? 'myGray.600' : undefined}
            whiteSpace={hasInlineDatasetParams ? 'nowrap' : undefined}
          >
            {t('workflow:auth_tmb_id')}
          </Box>
          <QuestionTip
            ml={hasInlineDatasetParams ? 1 : undefined}
            label={t('workflow:auth_tmb_id_tip')}
          />
          <Switch
            ml={hasInlineDatasetParams ? 2 : 1}
            size={'sm'}
            isChecked={!!authTmbIdInput.value}
            onChange={(e) => onChangeDatasetParams({ authTmbId: e.target.checked })}
          />
        </Flex>
      )}
      {hasInlineDatasetParams && (
        <Button
          variant={'transparentBase'}
          leftIcon={<MyIcon name={'edit'} w={'12px'} />}
          iconSpacing={1}
          size={'xs'}
          color={'myGray.600'}
          mr={'-5px'}
          data-dataset-params-trigger={nodeId}
          onClick={onOpenDatasetParams}
        >
          {t('common:Params')}
        </Button>
      )}
      {isOpenDatasetParams && (
        <DatasetParamsModal
          {...datasetParams}
          appId={appId || undefined}
          maxTokens={llmMaxQuoteContext}
          showTagFilter={!!feConfigs?.isPlus}
          canSwitchTagFilterMode
          datasetIds={datasetIds}
          tagFilterReferenceList={referenceList}
          onClose={onCloseDatasetParams}
          onSuccess={onChangeDatasetParams}
        />
      )}
    </Flex>
  );
});

export default SelectDatasetRender;
