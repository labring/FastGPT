import React, { useEffect, useMemo, useState } from 'react';
import type { RenderInputProps } from '../type';
import { getFlowStore, onChangeNode, useFlowProviderStoreType } from '../../../../FlowProvider';
import { Box, Button, Flex, Grid, useDisclosure, useTheme } from '@chakra-ui/react';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { SelectedDatasetType } from '@fastgpt/global/core/module/api';
import Avatar from '@/components/Avatar';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'next-i18next';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';

import dynamic from 'next/dynamic';
import MyIcon from '@fastgpt/web/components/common/Icon';

const DatasetSelectModal = dynamic(() => import('@/components/core/module/DatasetSelectModal'));
const DatasetParamsModal = dynamic(() => import('@/components/core/module/DatasetParamsModal'));

const SelectDatasetRender = ({ inputs = [], item, moduleId }: RenderInputProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { llmModelList } = useSystemStore();
  const [nodes, setNodes] = useState<useFlowProviderStoreType['nodes']>([]);
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

  const selectedDatasets = useMemo(() => {
    const value = item.value as SelectedDatasetType;
    return allDatasets.filter((dataset) => value?.find((item) => item.datasetId === dataset._id));
  }, [allDatasets, item.value]);

  const tokenLimit = useMemo(() => {
    let maxTokens = 3000;

    nodes.forEach((item) => {
      if (item.type === FlowNodeTypeEnum.chatNode) {
        const model =
          item.data.inputs.find((item) => item.key === ModuleInputKeyEnum.aiModel)?.value || '';
        const quoteMaxToken =
          llmModelList.find((item) => item.model === model)?.quoteMaxToken || 3000;

        maxTokens = Math.max(maxTokens, quoteMaxToken);
      }
    });

    return maxTokens;
  }, [nodes]);

  const {
    isOpen: isOpenDatasetPrams,
    onOpen: onOpenDatasetParams,
    onClose: onCloseDatasetParams
  } = useDisclosure();

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

  useEffect(() => {
    async () => {
      const { nodes } = await getFlowStore();
      setNodes(nodes);
    };
  }, []);

  return (
    <>
      <Grid gridTemplateColumns={'repeat(2, minmax(0, 1fr))'} gridGap={4} minW={'350px'} w={'100%'}>
        <Button
          h={'36px'}
          leftIcon={<MyIcon name={'common/selectLight'} w={'14px'} />}
          onClick={onOpenDatasetSelect}
        >
          {t('common.Choose')}
        </Button>
        {/* <Button
          h={'36px'}
          variant={'whitePrimary'}
          leftIcon={<MyIcon name={'common/settingLight'} w={'14px'} />}
          onClick={onOpenDatasetParams}
        >
          {t('core.dataset.search.Params Setting')}
        </Button> */}
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
      {isOpenDatasetSelect && (
        <DatasetSelectModal
          isOpen={isOpenDatasetSelect}
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
          onClose={onCloseDatasetSelect}
        />
      )}
      {/* {isOpenDatasetPrams && (
        <DatasetParamsModal
          {...data}
          maxTokens={tokenLimit}
          onClose={onCloseDatasetParams}
          onSuccess={(e) => {
            for (let key in e) {
              const item = inputs.find((input) => input.key === key);
              if (!item) continue;
              onChangeNode({
                moduleId,
                type: 'updateInput',
                key,
                value: {
                  ...item,
                  //@ts-ignore
                  value: e[key]
                }
              });
            }
          }}
        />
      )} */}
    </>
  );
};

export default React.memo(SelectDatasetRender);
