import React, { useEffect, useMemo, useState } from 'react';
import type { RenderInputProps } from '../type';
import { Box, Button, Flex, Grid, useDisclosure, useTheme } from '@chakra-ui/react';
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

const DatasetSelectModal = dynamic(() => import('@/components/core/app/DatasetSelectModal'));

const SelectDatasetRender = ({ inputs = [], item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
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
              border={theme.borders.base}
              borderColor={'myGray.200'}
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
    t,
    theme.borders.base
  ]);

  return Render;
};

export default React.memo(SelectDatasetRender);
