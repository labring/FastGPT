import React, { useMemo, useState } from 'react';
import {
  Card,
  Flex,
  Box,
  Button,
  ModalBody,
  ModalFooter,
  useTheme,
  Grid,
  Divider
} from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/api.d';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { useTranslation } from 'next-i18next';
import DatasetSelectContainer, { useDatasetSelect } from '@/components/core/dataset/SelectModal';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

type ExtendedSelectedDatasetType = {
  datasetId: string;
  vectorModel: { model: string };
  name: string;
  avatar: string;
};

export const DatasetSelectModal = ({
  isOpen,
  defaultSelectedDatasets = [], //外面默认选中的id和向量,现在多了头像和名字，就不需要从all拿了
  onChange,
  onClose
}: {
  isOpen: boolean;
  defaultSelectedDatasets: ExtendedSelectedDatasetType[];
  onChange: (e: SelectedDatasetType) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  console.log('defaultSelectedDatasets:', defaultSelectedDatasets);
  const [selectedDatasets, setSelectedDatasets] =
    useState<SelectedDatasetType>(defaultSelectedDatasets);
  console.log('selectedDatasets:', selectedDatasets);
  const { toast } = useToast();
  const { paths, setParentId, datasets, isFetching } = useDatasetSelect(); //模态框里可用的知识库
  console.log('datasets length:', datasets.length);
  const { Loading } = useLoading();

  const filterDatasets = useMemo(() => {
    const filtered = {
      selected: datasets.filter(
        (item) => selectedDatasets.find((dataset) => dataset.datasetId === item._id) //已选
      ),
      unSelected: datasets.filter(
        (item) => !selectedDatasets.find((dataset) => dataset.datasetId === item._id)
      )
    };
    console.log('Filtered datasets:', filtered);
    return filtered;
  }, [datasets, selectedDatasets]);
  const activeVectorModel = defaultSelectedDatasets[0]?.vectorModel?.model;

  return (
    <DatasetSelectContainer
      isOpen={isOpen}
      paths={paths}
      setParentId={setParentId}
      tips={t('common:dataset.Select Dataset Tips')}
      onClose={onClose}
    >
      <Flex h={'100%'} flexDirection={'column'} flex={'1 0 0'}>
        <ModalBody flex={'1 0 0'} overflowY={'auto'} userSelect={'none'}>
          <Grid
            gridTemplateColumns={[
              'repeat(1, minmax(0, 1fr))',
              'repeat(2, minmax(0, 1fr))',
              'repeat(3, minmax(0, 1fr))'
            ]}
            gridGap={3}
          >
            {filterDatasets.selected.map((item) =>
              (() => {
                return (
                  <Card
                    key={item._id}
                    p={3}
                    border={theme.borders.base}
                    boxShadow={'sm'}
                    bg={'primary.200'}
                  >
                    <Flex alignItems={'center'} h={'38px'}>
                      <Avatar src={item.avatar} w={['1.25rem', '1.75rem']}></Avatar>
                      <Box flex={'1 0 0'} w={0} className="textEllipsis" mx={3}>
                        {item.name}
                      </Box>
                      <MyIcon
                        name={'delete'}
                        w={'14px'}
                        cursor={'pointer'}
                        _hover={{ color: 'red.500' }}
                        onClick={() => {
                          setSelectedDatasets((state) =>
                            state.filter((dataset) => dataset.datasetId !== item._id)
                          );
                        }}
                      />
                    </Flex>
                  </Card>
                );
              })()
            )}
          </Grid>

          {filterDatasets.selected.length > 0 && <Divider my={3} />}

          <Grid
            gridTemplateColumns={[
              'repeat(1, minmax(0, 1fr))',
              'repeat(2, minmax(0, 1fr))',
              'repeat(3, minmax(0, 1fr))'
            ]}
            gridGap={3}
          >
            {filterDatasets.unSelected.map((item) =>
              (() => {
                return (
                  <MyTooltip
                    key={item._id}
                    label={
                      item.type === DatasetTypeEnum.folder
                        ? t('common:dataset.Select Folder')
                        : t('common:dataset.Select Dataset')
                    }
                  >
                    <Card
                      p={3}
                      border={theme.borders.base}
                      boxShadow={'sm'}
                      h={'80px'}
                      cursor={'pointer'}
                      _hover={{
                        boxShadow: 'md'
                      }}
                      onClick={() => {
                        if (item.type === DatasetTypeEnum.folder) {
                          setParentId(item._id);
                        } else {
                          if (activeVectorModel && activeVectorModel !== item.vectorModel.model) {
                            return toast({
                              status: 'warning',
                              title: t('common:dataset.Select Dataset Tips')
                            });
                          }
                          console.log('you click', item._id);
                          console.log('Before click, selectedDatasets:', selectedDatasets);
                          setSelectedDatasets((state) => [...state, { datasetId: item._id }]);
                        }
                      }}
                    >
                      <Flex alignItems={'center'} h={'38px'}>
                        <Avatar src={item.avatar} w={['24px', '28px']}></Avatar>
                        <Box
                          flex={'1 0 0'}
                          w={0}
                          className="textEllipsis"
                          ml={3}
                          fontSize={'md'}
                          color={'myGray.900'}
                        >
                          {item.name}
                        </Box>
                      </Flex>
                      <Flex
                        justifyContent={'flex-end'}
                        alignItems={'center'}
                        fontSize={'sm'}
                        color={
                          activeVectorModel === item.vectorModel.name ? 'primary.600' : 'myGray.500'
                        }
                      >
                        {item.type === DatasetTypeEnum.folder ? (
                          <Box color={'myGray.500'}>{t('common:Folder')}</Box>
                        ) : (
                          <>
                            <MyIcon mr={1} name="kbTest" w={'12px'} />
                            <Box>{item.vectorModel.name}</Box>
                          </>
                        )}
                      </Flex>
                    </Card>
                  </MyTooltip>
                );
              })()
            )}
          </Grid>
          {filterDatasets.unSelected.length === 0 && (
            <EmptyTip text={t('common:common.folder.empty')} />
          )}
        </ModalBody>

        <ModalFooter>
          <Button
            onClick={() => {
              // filter out the dataset that is not in the kList
              const filterDatasets = selectedDatasets.filter((dataset) => {
                return datasets.find((item) => item._id === dataset.datasetId);
              });

              onClose();
              console.log('filterDatasets:', filterDatasets);
              onChange(filterDatasets);
            }}
          >
            {t('common:common.Done')}
          </Button>
        </ModalFooter>

        <Loading fixed={false} loading={isFetching} />
      </Flex>
    </DatasetSelectContainer>
  );
};

export default DatasetSelectModal;
