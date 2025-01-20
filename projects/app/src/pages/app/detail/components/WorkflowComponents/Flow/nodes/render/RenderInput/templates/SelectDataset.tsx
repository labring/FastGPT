import React, { useEffect, useMemo, useState } from 'react';
import type { RenderInputProps } from '../type';
import { Box, Button, Flex, Grid, Switch, useDisclosure, useTheme } from '@chakra-ui/react';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { SelectedDatasetType } from '@fastgpt/global/core/workflow/api';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'next-i18next';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';

import dynamic from 'next/dynamic';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

const DatasetSelectModal = dynamic(() => import('@/components/core/app/DatasetSelectModal'));

export const SelectDatasetRender = React.memo(function SelectDatasetRender({
  inputs = [],
  item,
  nodeId
}: RenderInputProps) {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const [data, setData] = useState({
    searchMode: DatasetSearchModeEnum.embedding,
    limit: 5,
    similarity: 0.5,
    usingReRank: false
  });

  const { allDatasets, loadAllDatasets } = useDatasetStore();
  const {
    isOpen: isOpenDatasetSelect,
    onOpen: onOpenDatasetSelect,
    onClose: onCloseDatasetSelect
  } = useDisclosure();

  const selectedDatasetsValue = useMemo(() => {
    if (Array.isArray(item.value)) return item.value as SelectedDatasetType;
    return [] as SelectedDatasetType;
  }, [item.value]);

  const selectedDatasets = useMemo(() => {
    return allDatasets.filter((dataset) =>
      selectedDatasetsValue?.find((item) => item.datasetId === dataset._id)
    );
  }, [allDatasets, selectedDatasetsValue]);

  useQuery(['loadAllDatasets'], loadAllDatasets);

  useEffect(() => {
    inputs.forEach((input) => {
      // @ts-ignore
      if (data[input.key] !== undefined) {
        setData((state) => ({
          ...state,
          [input.key]: input.value
        }));
      }
    });
  }, [inputs]);

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
            {t('common:common.Choose')}
          </Button>
          {selectedDatasets.map((item) => (
            <Flex
              key={item._id}
              alignItems={'center'}
              h={10}
              boxShadow={'sm'}
              bg={'white'}
              border={'base'}
              px={2}
              borderRadius={'md'}
            >
              <Avatar src={item.avatar} w={'18px'} borderRadius={'xs'} />
              <Box
                ml={1.5}
                flex={'1 0 0'}
                w={0}
                className="textEllipsis"
                fontWeight={'bold'}
                fontSize={['sm', 'sm']}
              >
                {item.name}
              </Box>
            </Flex>
          ))}
        </Grid>
        {isOpenDatasetSelect && (
          <DatasetSelectModal
            isOpen={isOpenDatasetSelect}
            defaultSelectedDatasets={selectedDatasetsValue}
            onChange={(e) => {
              onChangeNode({
                nodeId,
                key: item.key,
                type: 'updateInput',
                value: {
                  ...item,
                  value: e
                }
              });
            }}
            onClose={onCloseDatasetSelect}
          />
        )}
      </>
    );
  }, [
    isOpenDatasetSelect,
    item,
    nodeId,
    onChangeNode,
    onCloseDatasetSelect,
    onOpenDatasetSelect,
    selectedDatasets,
    selectedDatasetsValue,
    t
  ]);

  return Render;
});

export const SwitchAuthTmb = React.memo(function SwitchAuthTmb({
  inputs = [],
  item,
  nodeId
}: RenderInputProps) {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const authTmbIdInput = useMemo(
    () => inputs.find((v) => v.key === NodeInputKeyEnum.authTmbId),
    [inputs]
  );

  return authTmbIdInput ? (
    <Flex alignItems={'center'}>
      <Box fontSize={'sm'}>{t('workflow:auth_tmb_id')}</Box>
      <QuestionTip label={t('workflow:auth_tmb_id_tip')} />
      <Switch
        ml={1}
        size={'sm'}
        isChecked={!!authTmbIdInput.value}
        onChange={(e) => {
          onChangeNode({
            nodeId,
            key: NodeInputKeyEnum.authTmbId,
            type: 'updateInput',
            value: {
              ...authTmbIdInput,
              value: e.target.checked
            }
          });
        }}
      />
    </Flex>
  ) : null;
});

export default SelectDatasetRender;
