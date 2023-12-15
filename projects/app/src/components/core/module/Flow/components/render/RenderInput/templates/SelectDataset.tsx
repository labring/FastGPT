import React, { useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { onChangeNode } from '../../../../FlowProvider';
import { Box, Button, Flex, Grid, useDisclosure, useTheme } from '@chakra-ui/react';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { SelectedDatasetType } from '@fastgpt/global/core/module/api';
import Avatar from '@/components/Avatar';
import DatasetSelectModal from '@/components/core/module/DatasetSelectModal';
import { useQuery } from '@tanstack/react-query';

const SelectDatasetRender = ({ item, moduleId }: RenderInputProps) => {
  const theme = useTheme();
  const { allDatasets, loadAllDatasets } = useDatasetStore();
  const {
    isOpen: isOpenKbSelect,
    onOpen: onOpenKbSelect,
    onClose: onCloseKbSelect
  } = useDisclosure();

  const selectedDatasets = useMemo(() => {
    const value = item.value as SelectedDatasetType;
    return allDatasets.filter((dataset) => value?.find((item) => item.datasetId === dataset._id));
  }, [allDatasets, item.value]);

  useQuery(['loadAllDatasets'], loadAllDatasets);

  return (
    <>
      <Grid gridTemplateColumns={'repeat(2, minmax(0, 1fr))'} gridGap={4} minW={'350px'} w={'100%'}>
        <Button h={'36px'} onClick={onOpenKbSelect}>
          选择知识库
        </Button>
        {selectedDatasets.map((item) => (
          <Flex
            key={item._id}
            alignItems={'center'}
            h={'36px'}
            border={theme.borders.base}
            px={2}
            borderRadius={'md'}
          >
            <Avatar src={item.avatar} w={'24px'}></Avatar>
            <Box
              ml={3}
              flex={'1 0 0'}
              w={0}
              className="textEllipsis"
              fontWeight={'bold'}
              fontSize={['md', 'lg', 'xl']}
            >
              {item.name}
            </Box>
          </Flex>
        ))}
      </Grid>
      {isOpenKbSelect && (
        <DatasetSelectModal
          isOpen={isOpenKbSelect}
          defaultSelectedDatasets={item.value}
          onChange={(e) => {
            onChangeNode({
              moduleId,
              key: item.key,
              type: 'updateInput',
              value: {
                ...item,
                value: e
              }
            });
          }}
          onClose={onCloseKbSelect}
        />
      )}
    </>
  );
};

export default React.memo(SelectDatasetRender);
