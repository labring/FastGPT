import {
  Box,
  Button,
  Flex,
  ModalBody,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useMemo, useState } from 'react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  deleteTrainingData,
  getDatasetCollectionTrainingDetail,
  getTrainingDataDetail,
  getTrainingError,
  updateTrainingData
} from '@/web/core/dataset/api';
import { DatasetCollectionDataProcessModeEnum } from '@fastgpt/global/core/dataset/constants';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { type getTrainingDataDetailResponse } from '@/pages/api/core/dataset/training/getTrainingDataDetail';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import { TrainingProcess } from '@/web/core/dataset/constants';
import { useForm } from 'react-hook-form';
import type { getTrainingDetailResponse } from '@/pages/api/core/dataset/collection/trainingDetail';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyImage from '@/components/MyImage';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

enum TrainingStatus {
  NotStart = 'NotStart',
  Queued = 'Queued', // wait count>0
  Running = 'Running', // wait count=0; training count>0.
  Ready = 'Ready',
  Error = 'Error'
}

const ProgressView = ({ trainingDetail }: { trainingDetail: getTrainingDetailResponse }) => {
  const { t } = useTranslation();

  const isQA = trainingDetail?.trainingType === DatasetCollectionDataProcessModeEnum.qa;
  const isImageParse =
    trainingDetail?.trainingType === DatasetCollectionDataProcessModeEnum.imageParse;

  /* 
    状态计算
    1. 暂时没有内容解析的状态
    2. 完全没有训练数据时候，已就绪
    3. 有训练数据，中间过程全部是进行中
  */
  const statesArray = useMemo(() => {
    const isReady =
      Object.values(trainingDetail.queuedCounts).every((count) => count === 0) &&
      Object.values(trainingDetail.trainingCounts).every((count) => count === 0) &&
      Object.values(trainingDetail.errorCounts).every((count) => count === 0);

    const isContentParsing = trainingDetail.trainingCounts.parse > 0;

    const getTrainingStatus = ({ errorCount }: { errorCount: number }) => {
      if (isContentParsing) return TrainingStatus.NotStart;
      if (isReady) return TrainingStatus.Ready;
      if (errorCount > 0) {
        return TrainingStatus.Error;
      }
      return TrainingStatus.Running;
    };

    // 只显示排队和处理中的数量
    const getStatusText = (mode: TrainingModeEnum) => {
      if (isReady) return;

      if (trainingDetail.queuedCounts[mode] > 0) {
        return t('dataset:dataset.Training_Waiting', {
          count: trainingDetail.queuedCounts[mode]
        });
      }
      if (trainingDetail.trainingCounts[mode] > 0) {
        return t('dataset:dataset.Training_Count', {
          count: trainingDetail.trainingCounts[mode]
        });
      }
      return;
    };

    const states: {
      label: string;
      statusText?: string;
      status: TrainingStatus;
      errorCount: number;
    }[] = [
      {
        label: t(TrainingProcess.parsing.label),
        status: (() => {
          if (trainingDetail.errorCounts.parse > 0) return TrainingStatus.Error;
          if (isContentParsing) return TrainingStatus.Running;
          return TrainingStatus.Ready;
        })(),
        errorCount: trainingDetail.errorCounts.parse
      },
      ...(isImageParse
        ? [
            {
              errorCount: trainingDetail.errorCounts.imageParse,
              label: t(TrainingProcess.parseImage.label),
              statusText: getStatusText(TrainingModeEnum.imageParse),
              status: getTrainingStatus({
                errorCount: trainingDetail.errorCounts.imageParse
              })
            }
          ]
        : []),
      ...(isQA
        ? [
            {
              label: t(TrainingProcess.getQA.label),
              statusText: getStatusText(TrainingModeEnum.qa),
              status: getTrainingStatus({
                errorCount: trainingDetail.errorCounts.qa
              }),
              errorCount: trainingDetail.errorCounts.qa
            }
          ]
        : []),
      ...(trainingDetail?.advancedTraining.imageIndex
        ? [
            {
              errorCount: trainingDetail.errorCounts.image,
              label: t(TrainingProcess.imageIndex.label),
              statusText: getStatusText(TrainingModeEnum.image),
              status: getTrainingStatus({
                errorCount: trainingDetail.errorCounts.image
              })
            }
          ]
        : []),
      ...(trainingDetail?.advancedTraining.autoIndexes
        ? [
            {
              errorCount: trainingDetail.errorCounts.auto,
              label: t(TrainingProcess.autoIndex.label),
              statusText: getStatusText(TrainingModeEnum.auto),
              status: getTrainingStatus({
                errorCount: trainingDetail.errorCounts.auto
              })
            }
          ]
        : []),
      {
        errorCount: trainingDetail.errorCounts.chunk,
        label: t(TrainingProcess.vectorizing.label),
        statusText: getStatusText(TrainingModeEnum.chunk),
        status: getTrainingStatus({
          errorCount: trainingDetail.errorCounts.chunk
        })
      },
      {
        errorCount: 0,
        label: t('dataset:process.Is_Ready'),
        status: isReady ? TrainingStatus.Ready : TrainingStatus.NotStart,
        statusText: isReady
          ? undefined
          : t('dataset:training_ready', {
              count: trainingDetail.trainedCount
            })
      }
    ];

    return states;
  }, [
    trainingDetail.queuedCounts,
    trainingDetail.trainingCounts,
    trainingDetail.errorCounts,
    trainingDetail?.advancedTraining.imageIndex,
    trainingDetail?.advancedTraining.autoIndexes,
    trainingDetail.trainedCount,
    t,
    isImageParse,
    isQA
  ]);

  return (
    <Flex flexDirection={'column'} gap={6}>
      {statesArray.map((item, index) => (
        <Flex alignItems={'center'} pl={4} key={index}>
          {/* Status round */}
          <Box
            w={'14px'}
            h={'14px'}
            borderWidth={'2px'}
            borderRadius={'50%'}
            position={'relative'}
            display={'flex'}
            alignItems={'center'}
            justifyContent={'center'}
            {...((item.status === TrainingStatus.Running ||
              item.status === TrainingStatus.Error) && {
              bg: 'primary.600',
              borderColor: 'primary.600',
              boxShadow: '0 0 0 4px var(--Royal-Blue-100, #E1EAFF)'
            })}
            {...(item.status === TrainingStatus.Ready && {
              bg: 'primary.600',
              borderColor: 'primary.600'
            })}
            // Line
            {...(index !== statesArray.length - 1 && {
              _after: {
                content: '""',
                height: '59px',
                width: '2px',
                bgColor: 'myGray.250',
                position: 'absolute',
                top: '14px',
                left: '4px'
              }
            })}
          >
            {item.status === TrainingStatus.Ready && (
              <MyIcon name="common/check" w={3} color={'white'} />
            )}
          </Box>
          {/* Card */}
          <Flex
            alignItems={'center'}
            w={'full'}
            bg={
              item.status === TrainingStatus.Running
                ? 'primary.50'
                : item.status === TrainingStatus.Error
                  ? 'red.50'
                  : 'myGray.50'
            }
            py={2.5}
            px={3}
            ml={5}
            borderRadius={'8px'}
            flex={1}
            h={'53px'}
          >
            <Box
              fontSize={'14px'}
              fontWeight={'medium'}
              color={item.status === TrainingStatus.NotStart ? 'myGray.400' : 'myGray.900'}
              mr={2}
            >
              {t(item.label as any)}
            </Box>
            {item.status === TrainingStatus.Error && (
              <MyTag
                showDot
                type={'borderSolid'}
                px={1}
                fontSize={'mini'}
                borderRadius={'md'}
                h={5}
                colorSchema={'red'}
              >
                {t('dataset:training.Error', { count: item.errorCount })}
              </MyTag>
            )}
            <Box flex={1} />
            {!!item.statusText && (
              <Flex fontSize={'sm'} alignItems={'center'}>
                {item.statusText}
              </Flex>
            )}
          </Flex>
        </Flex>
      ))}
    </Flex>
  );
};

const ErrorView = ({
  datasetId,
  collectionId,
  refreshTrainingDetail
}: {
  datasetId: string;
  collectionId: string;
  refreshTrainingDetail: () => void;
}) => {
  const { t } = useTranslation();
  const TrainingText = {
    [TrainingModeEnum.parse]: t('dataset:process.Parsing'),
    [TrainingModeEnum.chunk]: t('dataset:process.Vectorizing'),
    [TrainingModeEnum.qa]: t('dataset:process.Get QA'),
    [TrainingModeEnum.imageParse]: t('dataset:process.Image_Index'),
    [TrainingModeEnum.image]: t('dataset:process.Image_Index'),
    [TrainingModeEnum.auto]: t('dataset:process.Auto_Index')
  };

  const [editChunk, setEditChunk] = useState<getTrainingDataDetailResponse>();

  const {
    data: errorList,
    ScrollData,
    isLoading,
    refreshList
  } = useScrollPagination(getTrainingError, {
    pageSize: 15,
    params: {
      collectionId
    },
    EmptyTip: <EmptyTip />
  });

  const { runAsync: getData, loading: getDataLoading } = useRequest2(
    (data: { datasetId: string; collectionId: string; dataId: string }) => {
      return getTrainingDataDetail(data);
    },
    {
      manual: true,
      onSuccess: (data) => {
        setEditChunk(data);
      }
    }
  );
  const { runAsync: deleteData, loading: deleteLoading } = useRequest2(
    (data: { datasetId: string; collectionId: string; dataId: string }) => {
      return deleteTrainingData(data);
    },
    {
      manual: true,
      onSuccess: () => {
        refreshList();
      }
    }
  );
  const { runAsync: updateData, loading: updateLoading } = useRequest2(
    (data: { datasetId: string; collectionId: string; dataId: string; q?: string; a?: string }) => {
      return updateTrainingData(data);
    },
    {
      manual: true,
      onSuccess: () => {
        refreshList();
        refreshTrainingDetail();
        setEditChunk(undefined);
      }
    }
  );

  if (editChunk) {
    return (
      <EditView
        loading={updateLoading}
        editChunk={editChunk}
        onCancel={() => setEditChunk(undefined)}
        onSave={(data) => {
          updateData({
            datasetId,
            collectionId,
            dataId: editChunk._id,
            ...data
          });
        }}
      />
    );
  }

  return (
    <ScrollData
      h={'400px'}
      isLoading={isLoading || updateLoading || getDataLoading || deleteLoading}
    >
      <TableContainer overflowY={'auto'} fontSize={'12px'}>
        <Table variant={'simple'}>
          <Thead>
            <Tr>
              <Th pr={0}>{t('dataset:dataset.Chunk_Number')}</Th>
              <Th pr={0}>{t('dataset:dataset.Training_Status')}</Th>
              <Th>{t('dataset:dataset.Error_Message')}</Th>
              <Th>{t('dataset:dataset.Operation')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {errorList.map((item, index) => (
              <Tr key={index}>
                <Td>{item.chunkIndex + 1}</Td>
                <Td>{TrainingText[item.mode]}</Td>
                <Td maxW={50}>
                  <MyTooltip label={item.errorMsg}>{item.errorMsg}</MyTooltip>
                </Td>
                <Td>
                  <Flex alignItems={'center'}>
                    <Button
                      variant={'ghost'}
                      size={'sm'}
                      color={'myGray.600'}
                      leftIcon={<MyIcon name={'common/confirm/restoreTip'} w={4} />}
                      fontSize={'mini'}
                      onClick={() => updateData({ datasetId, collectionId, dataId: item._id })}
                    >
                      {t('dataset:dataset.ReTrain')}
                    </Button>
                    <Box w={'1px'} height={'16px'} bg={'myGray.200'} />
                    <Button
                      variant={'ghost'}
                      size={'sm'}
                      color={'myGray.600'}
                      leftIcon={<MyIcon name={'edit'} w={4} />}
                      fontSize={'mini'}
                      onClick={() => getData({ datasetId, collectionId, dataId: item._id })}
                    >
                      {t('dataset:dataset.Edit_Chunk')}
                    </Button>
                    <Box w={'1px'} height={'16px'} bg={'myGray.200'} />
                    <Button
                      variant={'ghost'}
                      size={'sm'}
                      color={'myGray.600'}
                      leftIcon={<MyIcon name={'delete'} w={4} />}
                      fontSize={'mini'}
                      onClick={() => {
                        deleteData({ datasetId, collectionId, dataId: item._id });
                      }}
                    >
                      {t('dataset:dataset.Delete_Chunk')}
                    </Button>
                  </Flex>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
    </ScrollData>
  );
};

const EditView = ({
  loading,
  editChunk,
  onCancel,
  onSave
}: {
  loading: boolean;
  editChunk: getTrainingDataDetailResponse;
  onCancel: () => void;
  onSave: (data: { q: string; a?: string }) => void;
}) => {
  const { t } = useTranslation();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      q: editChunk?.q || '',
      a: editChunk?.a || ''
    }
  });

  return (
    <Flex flexDirection={'column'} gap={4}>
      {editChunk?.imagePreviewUrl && (
        <Box>
          <FormLabel>{t('file:image')}</FormLabel>
          <Box w={'100%'} h={'200px'} border={'base'} borderRadius={'md'}>
            <MyImage src={editChunk.imagePreviewUrl} alt="image" w={'100%'} h={'100%'} />
          </Box>
        </Box>
      )}

      <Box>
        {(editChunk?.a || editChunk?.imagePreviewUrl) && (
          <FormLabel>
            {editChunk?.a
              ? t('common:dataset_data_input_chunk_content')
              : t('common:dataset_data_input_q')}
          </FormLabel>
        )}
        <MyTextarea
          {...register('q', { required: true })}
          minH={editChunk?.a || editChunk?.imagePreviewUrl ? 200 : 400}
        />
      </Box>

      {editChunk?.a && (
        <Box>
          <Box>{t('common:dataset_data_input_a')}</Box>
          <MyTextarea {...register('a')} minH={200} />
        </Box>
      )}
      <Flex justifyContent={'flex-end'} gap={4}>
        <Button variant={'outline'} onClick={onCancel}>
          {t('common:Cancel')}
        </Button>
        <Button isLoading={loading} variant={'primary'} onClick={handleSubmit(onSave)}>
          {t('common:Confirm')}
        </Button>
      </Flex>
    </Flex>
  );
};

const TrainingStates = ({
  datasetId,
  collectionId,
  defaultTab = 'states',
  onClose
}: {
  datasetId: string;
  collectionId: string;
  defaultTab?: 'states' | 'errors';
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<typeof defaultTab>(defaultTab);

  const {
    data: trainingDetail,
    loading,
    runAsync: refreshTrainingDetail
  } = useRequest2(() => getDatasetCollectionTrainingDetail(collectionId), {
    pollingInterval: 5000,
    pollingWhenHidden: false,
    manual: false
  });

  const errorCounts = (Object.values(trainingDetail?.errorCounts || {}) as number[]).reduce(
    (acc, count) => acc + count,
    0
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="common/running"
      title={t('dataset:dataset.Training Process')}
      minW={['90vw', '712px']}
      isLoading={!trainingDetail && loading && tab === 'states'}
    >
      <ModalBody px={9} minH={['90vh', '500px']}>
        <FillRowTabs
          py={1}
          mb={6}
          value={tab}
          onChange={(e) => setTab(e as 'states' | 'errors')}
          list={[
            { label: t('dataset:dataset.Training Process'), value: 'states' },
            {
              label: t('dataset:dataset.Training_Errors', {
                count: errorCounts
              }),
              value: 'errors'
            }
          ]}
        />
        {tab === 'states' && trainingDetail && <ProgressView trainingDetail={trainingDetail} />}
        {tab === 'errors' && (
          <ErrorView
            datasetId={datasetId}
            collectionId={collectionId}
            refreshTrainingDetail={refreshTrainingDetail}
          />
        )}
      </ModalBody>
    </MyModal>
  );
};

export default TrainingStates;
