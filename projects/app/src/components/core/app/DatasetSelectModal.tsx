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

export const DatasetSelectModal = ({
  isOpen,
  defaultSelectedDatasets = [],
  onChange,
  onClose
}: {
  isOpen: boolean;
  defaultSelectedDatasets: SelectedDatasetType;
  onChange: (e: SelectedDatasetType) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const [selectedDatasets, setSelectedDatasets] =
    useState<SelectedDatasetType>(defaultSelectedDatasets);
  const { toast } = useToast();
  const { paths, setParentId, datasets, isFetching } = useDatasetSelect();
  const { Loading } = useLoading();

  const unSelectedDatasets = useMemo(() => {
    return datasets.filter(
      (item) => !selectedDatasets.some((dataset) => dataset.datasetId === item._id)
    );
  }, [datasets, selectedDatasets]);

  const activeVectorModel = selectedDatasets[0]?.vectorModel?.model;

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
            {selectedDatasets.map((item) =>
              (() => {
                return (
                  <MyTooltip label={item.name}>
                    <Card
                      key={item.datasetId}
                      p={3}
                      border={'base'}
                      boxShadow={'sm'}
                      bg={'primary.200'}
                    >
                      <Flex alignItems={'center'} h={'38px'}>
                        <Avatar
                          src={item.avatar}
                          w={['1.25rem', '1.75rem']}
                          borderRadius={'sm'}
                        ></Avatar>
                        <Box flex={'1 0 0'} w={0} className="textEllipsis" mx={3} fontSize={'sm'}>
                          {item.name}
                        </Box>
                        <MyIcon
                          name={'delete'}
                          w={'14px'}
                          cursor={'pointer'}
                          _hover={{ color: 'red.500' }}
                          onClick={() => {
                            setSelectedDatasets((state) =>
                              state.filter((dataset) => dataset.datasetId !== item.datasetId)
                            );
                          }}
                        />
                      </Flex>
                    </Card>
                  </MyTooltip>
                );
              })()
            )}
          </Grid>

          {selectedDatasets.length > 0 && <Divider my={3} />}

          <Grid
            gridTemplateColumns={[
              'repeat(1, minmax(0, 1fr))',
              'repeat(2, minmax(0, 1fr))',
              'repeat(3, minmax(0, 1fr))'
            ]}
            gridGap={3}
          >
            {unSelectedDatasets.map((item) =>
              (() => {
                return (
                  <MyTooltip
                    key={item._id}
                    label={
                      item.type === DatasetTypeEnum.folder
                        ? t('common:dataset.Select Folder')
                        : item.name
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
                          setSelectedDatasets((state) => [
                            ...state,
                            {
                              datasetId: item._id,
                              avatar: item.avatar,
                              name: item.name,
                              vectorModel: item.vectorModel
                            }
                          ]);
                        }
                      }}
                    >
                      <Flex alignItems={'center'} h={'38px'}>
                        <Avatar
                          src={item.avatar}
                          w={['1.25rem', '1.75rem']}
                          borderRadius={'sm'}
                        ></Avatar>
                        <Box
                          flex={'1 0 0'}
                          w={0}
                          className="textEllipsis"
                          ml={3}
                          color={'myGray.900'}
                          fontSize={'sm'}
                        >
                          {item.name}
                        </Box>
                      </Flex>
                      <Flex
                        justifyContent={'flex-end'}
                        alignItems={'center'}
                        fontSize={'sm'}
                        color={
                          activeVectorModel === item.vectorModel.model
                            ? 'primary.600'
                            : 'myGray.500'
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
          {unSelectedDatasets.length === 0 && <EmptyTip text={t('common:common.folder.empty')} />}
        </ModalBody>

        <ModalFooter>
          <Button
            onClick={() => {
              onClose();
              onChange(selectedDatasets);
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
