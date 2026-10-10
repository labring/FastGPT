import React, { useCallback, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Box, Button, Flex, Grid, Switch, useDisclosure } from '@chakra-ui/react';
import { type SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import MyIcon from '@fastgpt/web/components/common/Icon';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useField, useFieldActions } from '@/web/core/workflow/editor/react/useField';
import DatasetCard from '@/components/core/app/DatasetCard';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const DatasetSelectModal = dynamic(() => import('@/components/core/app/DatasetSelectModal'));

export const SelectDatasetRender = React.memo(function SelectDatasetRender({
  item,
  nodeId
}: RenderInputProps) {
  const { t } = useTranslation();
  const currentInput = useField(nodeId, item.key, 'input', (field) => field?.data.input);
  const fieldActions = useFieldActions({ nodeId, fieldKey: item.key, kind: 'input' });

  const {
    isOpen: isOpenDatasetSelect,
    onOpen: onOpenDatasetSelect,
    onClose: onCloseDatasetSelect
  } = useDisclosure();

  const selectedDatasets = useMemo(() => {
    if (Array.isArray(currentInput?.value)) return currentInput.value as SelectedDatasetType[];
    return [] as SelectedDatasetType[];
  }, [currentInput?.value]);

  const onDeleteDataset = useCallback(
    (datasetId: string) => {
      fieldActions.setValue(selectedDatasets.filter((dataset) => dataset.datasetId !== datasetId));
    },
    [fieldActions, selectedDatasets]
  );

  const Render = useMemo(() => {
    return (
      <>
        <Grid
          gridTemplateColumns={'repeat(2, minmax(0, 1fr))'}
          gridGap={4}
          minW={'350px'}
          w={'100%'}
        >
          <Button
            h={10}
            leftIcon={<MyIcon name={'common/selectLight'} w={'14px'} />}
            onClick={onOpenDatasetSelect}
          >
            {t('common:Choose')}
          </Button>
          {selectedDatasets.map((dataset) => (
            <DatasetCard key={dataset.datasetId} dataset={dataset} onDelete={onDeleteDataset} />
          ))}
        </Grid>
        {isOpenDatasetSelect && (
          <DatasetSelectModal
            defaultSelectedDatasets={selectedDatasets.map((item) => ({
              datasetId: item.datasetId,
              name: item.name,
              avatar: item.avatar,
              vectorModel: item.vectorModel,
              isDeleted: item.isDeleted
            }))}
            onChange={(e) => {
              fieldActions.setValue(e);
            }}
            onClose={onCloseDatasetSelect}
          />
        )}
      </>
    );
  }, [
    fieldActions,
    isOpenDatasetSelect,
    onCloseDatasetSelect,
    onOpenDatasetSelect,
    onDeleteDataset,
    selectedDatasets,
    t
  ]);

  if (!currentInput) return null;

  return Render;
});

export const SwitchAuthTmb = React.memo(function SwitchAuthTmb({ nodeId }: RenderInputProps) {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const authTmbIdInput = useField(
    nodeId,
    NodeInputKeyEnum.authTmbId,
    'input',
    (field) => field?.data.input
  );
  const authTmbFieldActions = useFieldActions({
    nodeId,
    fieldKey: NodeInputKeyEnum.authTmbId,
    kind: 'input'
  });

  const authTmbIdValue = authTmbIdInput?.value;

  return feConfigs?.isPlus && authTmbIdInput ? (
    <Flex alignItems={'center'}>
      <Box fontSize={'sm'}>{t('workflow:auth_tmb_id')}</Box>
      <QuestionTip label={t('workflow:auth_tmb_id_tip')} />
      <Switch
        ml={1}
        size={'sm'}
        isChecked={!!authTmbIdValue}
        onChange={(e) => {
          authTmbFieldActions.setValue(e.target.checked);
        }}
      />
    </Flex>
  ) : null;
});

export default SelectDatasetRender;
