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
  Tr,
  Spinner
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useState } from 'react';
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
import { getTrainingDataDetailResponse } from '@/pages/api/core/dataset/training/getTrainingDataDetail';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import { TrainingProcess, TrainingStatus, TrainingText } from '@/web/core/dataset/constants';
import { useForm } from 'react-hook-form';
import { getTrainingDetailResult } from '@/pages/api/core/dataset/collection/trainingDetail';
import { TFunction } from 'i18next';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

const getTrainingStatus = ({
  trainingCount,
  errorCount
}: {
  trainingCount: number;
  errorCount: number;
}) => {
  if (errorCount > 0) {
    return TrainingStatus.Error;
  }
  if (trainingCount > 0) {
    return TrainingStatus.InProgress;
  }
  return TrainingStatus.Normal;
};

const getProgress = (trainingAmount: number, t: TFunction) => {
  return trainingAmount > 0
    ? t('dataset:dataset.Training_Count', {
        count: trainingAmount
      })
    : t('dataset:dataset.Completed');
};

const ProgressView = ({ trainingDetail }: { trainingDetail: getTrainingDetailResult }) => {
  const { t } = useTranslation();

  const tagStyle = {
    showDot: true,
    type: 'fill' as const,
    px: 1,
    fontSize: 'mini',
    fontWeight: 'medium',
    rounded: 'full',
    h: 5
  };

  const isQA = trainingDetail?.trainingType === DatasetCollectionDataProcessModeEnum.qa;

  const statesArray = [
    {
      label: TrainingProcess.waiting.label,
      status: TrainingStatus.Normal,
      progress: t('dataset:dataset.Completed')
    },
    {
      label: TrainingProcess.parsing.label,
      status: TrainingStatus.Normal,
      progress: t('dataset:dataset.Completed')
    },
    ...(isQA
      ? [
          {
            mode: TrainingModeEnum.qa,
            label: TrainingProcess.getQA.label,
            progress: getProgress(trainingDetail.trainingCounts.qa, t),
            status: getTrainingStatus({
              trainingCount: trainingDetail.trainingCounts.qa,
              errorCount: trainingDetail.errorCounts.qa
            })
          }
        ]
      : []),
    ...(trainingDetail?.advancedTraining.imageIndex && !isQA
      ? [
          {
            mode: TrainingModeEnum.image,
            label: TrainingProcess.imageIndex.label,
            progress: getProgress(trainingDetail.trainingCounts.image, t),
            status: getTrainingStatus({
              trainingCount: trainingDetail.trainingCounts.image,
              errorCount: trainingDetail.errorCounts.image
            })
          }
        ]
      : []),
    ...(trainingDetail?.advancedTraining.autoIndexes && !isQA
      ? [
          {
            mode: TrainingModeEnum.auto,
            label: TrainingProcess.autoIndex.label,
            progress: getProgress(trainingDetail.trainingCounts.auto, t),
            status: getTrainingStatus({
              trainingCount: trainingDetail.trainingCounts.auto,
              errorCount: trainingDetail.errorCounts.auto
            })
          }
        ]
      : []),
    {
      mode: TrainingModeEnum.chunk,
      label: TrainingProcess.vectorizing.label,
      progress: getProgress(
        trainingDetail.trainingCounts.chunk +
          trainingDetail.trainingCounts.auto +
          trainingDetail.trainingCounts.image,
        t
      ),
      status: getTrainingStatus({
        trainingCount:
          trainingDetail.trainingCounts.chunk +
          trainingDetail.trainingCounts.auto +
          trainingDetail.trainingCounts.image,
        errorCount: trainingDetail.errorCounts.chunk
      })
    },
    {
      label: t('dataset:process.Is_Ready'),
      status: Object.values(trainingDetail?.trainingCounts || {}).every((count) => count === 0)
        ? TrainingStatus.Normal
        : TrainingStatus.NotStarted
    }
  ];

  return (
    <Flex flexDirection={'column'} gap={6}>
      {statesArray.map((item, index) => (
        <Flex alignItems={'center'} pl={4} key={item.label}>
          <Box
            w={'14px'}
            h={'14px'}
            borderWidth={'2px'}
            borderRadius={'50%'}
            position={'relative'}
            display={'flex'}
            alignItems={'center'}
            justifyContent={'center'}
            {...(item.status === TrainingStatus.InProgress || item.status === TrainingStatus.Error
              ? {
                  bg: 'primary.600',
                  borderColor: 'primary.600',
                  boxShadow: '0 0 0 4px var(--Royal-Blue-100, #E1EAFF)'
                }
              : item.status === TrainingStatus.Normal
                ? {
                    bg: 'primary.600',
                    borderColor: 'primary.600'
                  }
                : {
                    borderColor: 'myGray.250'
                  })}
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
            {item.status === TrainingStatus.Normal && (
              <MyIcon name="common/check" w={3} color={'white'} />
            )}
          </Box>
          <Flex
            alignItems={'center'}
            w={'full'}
            bg={
              item.status === TrainingStatus.InProgress
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
              color={item.status === TrainingStatus.NotStarted ? 'myGray.400' : 'myGray.900'}
              mr={2}
            >
              {t(item.label)}
            </Box>
            {item.status === TrainingStatus.Error && (
              <MyTag {...tagStyle} colorSchema={'red'}>
                {t('dataset:training.Error')}
              </MyTag>
            )}
            {item.status === TrainingStatus.InProgress && item.mode && (
              <Flex alignItems={'center'} gap={1}>
                <Spinner size={'xs'} color={'blue.500'} />
                {!!trainingDetail?.waitingCounts[item.mode] && (
                  <Box fontSize={'12px'}>
                    {t('dataset:dataset.Training_Waiting', {
                      count: trainingDetail?.waitingCounts[item.mode]
                    })}
                  </Box>
                )}
              </Flex>
            )}
            <Box flex={1} />
            <Box
              fontSize={'14px'}
              fontWeight={item.status === TrainingStatus.Normal ? 'medium' : 'normal'}
              color={
                item.status === TrainingStatus.NotStarted
                  ? 'myGray.400'
                  : item.status === TrainingStatus.Normal
                    ? 'green.500'
                    : 'myGray.600'
              }
            >
              {item.progress}
            </Box>
          </Flex>
        </Flex>
      ))}
    </Flex>
  );
};

const ErrorView = ({ datasetId, collectionId }: { datasetId: string; collectionId: string }) => {
  const { t } = useTranslation();
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
        setEditChunk(undefined);
      }
    }
  );

  if (editChunk) {
    return (
      <EditView
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
                <Td>{t(TrainingText[item.mode])}</Td>
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
  editChunk,
  onCancel,
  onSave
}: {
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
      {editChunk?.a && <Box>q</Box>}
      <MyTextarea {...register('q')} minH={editChunk?.a ? 200 : 400} />
      {editChunk?.a && (
        <>
          <Box>a</Box>
          <MyTextarea {...register('a')} minH={200} />
        </>
      )}
      <Flex justifyContent={'flex-end'} gap={4}>
        <Button variant={'outline'} onClick={onCancel}>
          {t('common:common.Cancel')}
        </Button>
        <Button variant={'primary'} onClick={handleSubmit(onSave)}>
          {t('dataset:dataset.ReTrain')}
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
  const [pollingInterval, setPollingInterval] = useState(2000);
  const [isFirstLoading, setIsFirstLoading] = useState(true);

  const { data: trainingDetail, loading } = useRequest2(
    () => getDatasetCollectionTrainingDetail(collectionId),
    {
      pollingInterval,
      pollingWhenHidden: false,
      manual: false,
      onSuccess: (data) => {
        setIsFirstLoading(false);
        if (Object.values(data.trainingCounts).every((count) => count === 0)) {
          setPollingInterval(0);
        }
      }
    }
  );

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
      isLoading={isFirstLoading && loading}
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
        {tab === 'errors' && <ErrorView datasetId={datasetId} collectionId={collectionId} />}
      </ModalBody>
    </MyModal>
  );
};

export default TrainingStates;
