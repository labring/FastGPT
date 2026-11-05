import React, { useCallback, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Box, Button, Flex, Grid, Switch, useDisclosure } from '@chakra-ui/react';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import MyIcon from '@fastgpt/web/components/common/Icon';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useContextSelector } from 'use-context-selector';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getSelectedInputRenderType } from '@fastgpt/global/common/workflow/reference';
import type { DatasetTagFilterValue } from '@fastgpt/global/core/dataset/search/tagFilter';
import { AppContext } from '@/pageComponents/app/detail/context';
import type { DatasetParamsModalFormType } from '@/components/core/app/DatasetParamsModal';
import DatasetCard from '@/components/core/app/DatasetCard';
import { useDatasetTagFilterPrune } from '@/components/core/dataset/DatasetTagFilterRows';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useField, useFieldActions } from '@/web/core/workflow/editor/react/useField';
import { useNodeActions } from '@/web/core/workflow/editor/react/useNode';
import { useWorkflowQuoteLimit } from '../../../../hooks/useWorkflowQuoteLimit';
import { useReference } from './Reference';
import {
  getDatasetSearchParamInputs,
  getDatasetSearchParams,
  getStaticDatasetIds
} from './SelectDatasetParams.utils';
import { AgentChooseButton } from '../../../NodeAgent/AgentInputs';

const DatasetSelectModal = dynamic(() => import('@/components/core/app/DatasetSelectModal'));
const DatasetParamsModal = dynamic(() => import('@/components/core/app/DatasetParamsModal'));

// Agent 节点将 datasetSimilarity 设为 hidden，使用紧凑卡片样式并将参数入口内联在标题右侧。
const hasInlineDatasetParamsInput = (inputs: RenderInputProps['inputs'] = []) => {
  const similarityInput = inputs.find((item) => item.key === NodeInputKeyEnum.datasetSimilarity);
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
  const currentInput = useField(nodeId, item.key, 'input', (field) => field?.data.input);
  const fieldActions = useFieldActions({ nodeId, fieldKey: item.key, kind: 'input' });
  const hasInlineDatasetParams = useMemo(() => hasInlineDatasetParamsInput(inputs), [inputs]);
  const {
    isOpen: isOpenDatasetSelect,
    onOpen: onOpenDatasetSelect,
    onClose: onCloseDatasetSelect
  } = useDisclosure();

  const selectedDatasets = useMemo(() => {
    if (Array.isArray(currentInput?.value)) return currentInput.value as SelectedDatasetType[];
    return [] as SelectedDatasetType[];
  }, [currentInput?.value]);

  const updateDatasets = useCallback(
    (nextDatasets: SelectedDatasetType[]) => {
      fieldActions.setValue(nextDatasets);
    },
    [fieldActions]
  );
  const onDeleteDataset = useCallback(
    (datasetId: string) => {
      updateDatasets(selectedDatasets.filter((dataset) => dataset.datasetId !== datasetId));
    },
    [selectedDatasets, updateDatasets]
  );

  if (!currentInput) return null;

  return (
    <>
      <Grid
        gridTemplateColumns={'repeat(2, minmax(0, 1fr))'}
        gridGap={hasInlineDatasetParams ? 3 : 4}
        minW={'350px'}
        w={'100%'}
      >
        {hasInlineDatasetParams ? (
          <AgentChooseButton
            tip={t('common:core.chat.Select dataset')}
            data-dataset-select-trigger={nodeId}
            onClick={onOpenDatasetSelect}
          />
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
            compact={hasInlineDatasetParams}
            onDelete={onDeleteDataset}
          />
        ))}
      </Grid>
      {isOpenDatasetSelect && (
        <DatasetSelectModal
          defaultSelectedDatasets={selectedDatasets.map((dataset) => ({
            datasetId: dataset.datasetId,
            name: dataset.name,
            avatar: dataset.avatar,
            vectorModel: dataset.vectorModel,
            error: dataset.error
          }))}
          onChange={updateDatasets}
          onClose={onCloseDatasetSelect}
        />
      )}
    </>
  );
});

export const SwitchAuthTmb = React.memo(function SwitchAuthTmb({
  inputs = [],
  item,
  nodeId
}: RenderInputProps) {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const appId = useContextSelector(AppContext, (v) => v.appId);
  const nodeActions = useNodeActions(nodeId);
  const authTmbIdInput = useField(
    nodeId,
    NodeInputKeyEnum.authTmbId,
    'input',
    (field) => field?.data.input
  );
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

  const hasInlineDatasetParams = useMemo(() => hasInlineDatasetParamsInput(inputs), [inputs]);
  const datasetIds = useMemo(() => getStaticDatasetIds(item), [item]);
  const datasetParams = useMemo(() => getDatasetSearchParams(inputs), [inputs]);

  // 参数编辑、权限开关和失效标签清理共用一次 Runtime 记录级提交。
  const onChangeDatasetParams = useCallback(
    (values: Partial<DatasetParamsModalFormType>) => {
      nodeActions?.updateNode((current) => {
        const nextInputs = [...current.inputs];
        getDatasetSearchParamInputs({ inputs: current.inputs, values }).forEach((input) => {
          const index = nextInputs.findIndex((item) => item.key === input.key);
          if (index >= 0) nextInputs[index] = input;
          else nextInputs.push(input);
        });
        return { inputs: nextInputs };
      });
    },
    [nodeActions]
  );
  const handlePruneTagFilter = useCallback(
    (collectionFilterMatch: DatasetTagFilterValue) =>
      onChangeDatasetParams({ collectionFilterMatch }),
    [onChangeDatasetParams]
  );

  useDatasetTagFilterPrune({
    datasetIds,
    value: datasetParams.collectionFilterMatch,
    onChange: handlePruneTagFilter
  });

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
