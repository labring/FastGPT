import {
  Box,
  Button,
  Flex,
  ModalBody,
  Progress,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Spinner,
  Center
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
  updateTrainingData
} from '@/web/core/dataset/api';
import { DatasetCollectionDataProcessModeEnum } from '@fastgpt/global/core/dataset/constants';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { getTrainingDataDetailResponse } from '@/pages/api/core/dataset/training/getTrainingDataDetail';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import { TrainingProcess, TrainingStatus, TrainingText } from '@/web/core/dataset/constants';
import {
  DatasetCollectionTrainingDetailType,
  TrainingErrorItem
} from '@/pages/api/core/dataset/collection/trainingDetail';
import { DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import { useForm } from 'react-hook-form';

const getTrainingStatus = ({
  mode,
  errorList,
  trainingAmount,
  trainedAmount
}: {
  mode: TrainingModeEnum;
  errorList?: TrainingErrorItem;
  trainingAmount: number;
  trainedAmount: number;
}) => {
  if (errorList?.data?.some((item) => item.mode === mode)) {
    return TrainingStatus.Error;
  }
  if (trainingAmount === 0 && trainedAmount === 0 && mode !== TrainingModeEnum.qa) {
    return TrainingStatus.NotStarted;
  }
  if (trainingAmount > 0) {
    return TrainingStatus.InProgress;
  }
  return TrainingStatus.Normal;
};

const getProcessString = (trainingAmount: number, trainedAmount: number) => {
  return `${trainedAmount} / ${trainingAmount + trainedAmount}`;
};

const getProcessValue = (trainingAmount: number, trainedAmount: number) => {
  return (trainedAmount / (trainingAmount + trainedAmount)) * 100;
};

const getTrainingCounts = (trainingDetail: any) => {
  const getCount = (type: string, indexType?: string) => ({
    training: trainingDetail?.trainingCounts?.[type] || 0,
    trained: trainingDetail?.indexesCounts?.[indexType || type] || 0
  });

  return {
    image: getCount('image'),
    auto: getCount('auto'),
    chunk: getCount('chunk', 'default'),
    qa: getCount('qa')
  };
};

const ProgressView = ({
  trainingDetail
}: {
  trainingDetail: DatasetCollectionTrainingDetailType;
}) => {
  const { t } = useTranslation();

  const counts = getTrainingCounts(trainingDetail);

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
      progress: '100%',
      progressValue: 100,
      status: TrainingStatus.Normal
    },
    {
      label: TrainingProcess.parsing.label,
      progress: '100%',
      progressValue: 100,
      status: TrainingStatus.Normal
    },
    ...(isQA
      ? [
          {
            mode: TrainingModeEnum.qa,
            label: TrainingProcess.getQA.label,
            progress: counts.qa.training
              ? t('dataset:dataset.Training_QA', {
                  count: counts.qa.training
                })
              : t('dataset:dataset.Completed'),
            status: getTrainingStatus({
              mode: TrainingModeEnum.qa,
              errorList: trainingDetail?.errorList,
              trainingAmount: counts.qa.training,
              trainedAmount: 0
            })
          }
        ]
      : []),
    ...(trainingDetail?.advancedTraining.imageIndex && !isQA
      ? [
          {
            mode: TrainingModeEnum.image,
            label: TrainingProcess.imageIndex.label,
            progress: getProcessString(counts.image.training, counts.image.trained),
            progressValue: getProcessValue(counts.image.training, counts.image.trained),
            status: getTrainingStatus({
              mode: TrainingModeEnum.image,
              errorList: trainingDetail?.errorList,
              trainingAmount: counts.image.training,
              trainedAmount: counts.image.trained
            })
          }
        ]
      : []),
    ...(trainingDetail?.advancedTraining.autoIndexes && !isQA
      ? [
          {
            mode: TrainingModeEnum.auto,
            label: TrainingProcess.autoIndex.label,
            progress: getProcessString(counts.auto.training, counts.auto.trained),
            progressValue: getProcessValue(counts.auto.training, counts.auto.trained),
            status: getTrainingStatus({
              mode: TrainingModeEnum.auto,
              errorList: trainingDetail?.errorList,
              trainingAmount: counts.auto.training,
              trainedAmount: counts.auto.trained
            })
          }
        ]
      : []),
    {
      mode: TrainingModeEnum.chunk,
      label: TrainingProcess.vectorizing.label,
      progress: getProcessString(
        counts.chunk.training + counts.image.training + counts.auto.training,
        counts.chunk.trained + counts.image.trained + counts.auto.trained
      ),
      progressValue: getProcessValue(
        counts.chunk.training + counts.image.training + counts.auto.training,
        counts.chunk.trained + counts.image.trained + counts.auto.trained
      ),
      status: getTrainingStatus({
        mode: TrainingModeEnum.chunk,
        errorList: trainingDetail?.errorList,
        trainingAmount: counts.chunk.training + counts.image.training + counts.auto.training,
        trainedAmount: counts.chunk.trained + counts.image.trained + counts.auto.trained
      })
    },
    {
      label: TrainingProcess.isReady.label,
      status: Object.values(trainingDetail?.trainingCounts || {}).every((count) => count === 0)
        ? TrainingStatus.Normal
        : TrainingStatus.NotStarted,
      progress: '',
      progressValue: undefined
    }
  ];

  const firstIndex = statesArray.findIndex(
    (item) => item.status === TrainingStatus.InProgress || item.status === TrainingStatus.Error
  );
  const highLightIndex = firstIndex === -1 ? statesArray.length - 1 : firstIndex;

  return (
    <Flex flexDirection={'column'} gap={6}>
      {statesArray.map((item, index) => (
        <Flex alignItems={'center'} pl={4} key={item.label}>
          <Box
            w={'12px'}
            h={'12px'}
            borderWidth={'2px'}
            borderRadius={'50%'}
            position={'relative'}
            {...(index === highLightIndex
              ? {
                  bg: 'primary.600',
                  borderColor: 'primary.600',
                  boxShadow: '0 0 0 4px var(--Royal-Blue-100, #E1EAFF)'
                }
              : {
                  borderColor: 'myGray.250'
                })}
            {...(index !== statesArray.length - 1 && {
              _after: {
                content: '""',
                height: '66px',
                width: '2px',
                bgColor: 'myGray.250',
                position: 'absolute',
                top: '10px',
                left: '3px'
              }
            })}
          ></Box>
          <Flex
            flexDirection={'column'}
            justifyContent={'center'}
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
            <Flex alignItems={'center'} w={'full'}>
              <Box
                fontSize={'14px'}
                fontWeight={'medium'}
                color={item.status === TrainingStatus.NotStarted ? 'myGray.400' : 'myGray.900'}
                mr={2}
              >
                {t(item.label)}
              </Box>
              {item.status === TrainingStatus.Normal && (
                <MyTag {...tagStyle} colorSchema={'green'}>
                  {t('dataset:training.Normal')}
                </MyTag>
              )}
              {item.status === TrainingStatus.Error && (
                <MyTag {...tagStyle} colorSchema={'red'}>
                  {t('dataset:training.Error')}
                </MyTag>
              )}
              {item.status === TrainingStatus.InProgress && item.mode && (
                <Flex alignItems={'center'} gap={1}>
                  <Spinner size={'xs'} color={'blue.500'} />
                  {!!trainingDetail?.trainingWaitingCounts[item.mode] && (
                    <Box fontSize={'12px'}>
                      {t('dataset:dataset.Training_Waiting', {
                        count: trainingDetail?.trainingWaitingCounts[item.mode]
                      })}
                    </Box>
                  )}
                </Flex>
              )}
              <Box flex={1} />
              <Box
                fontSize={'14px'}
                color={item.status === TrainingStatus.NotStarted ? 'myGray.400' : 'myGray.900'}
              >
                {item.progress}
              </Box>
            </Flex>

            {item.progressValue !== undefined && item.status !== TrainingStatus.NotStarted && (
              <Progress
                mt={2}
                value={item.progressValue}
                size={'xs'}
                colorScheme={item.status === TrainingStatus.Error ? 'red' : 'blue'}
                borderRadius={'md'}
                isAnimated
                hasStripe
              />
            )}
          </Flex>
        </Flex>
      ))}
    </Flex>
  );
};

const ErrorView = ({
  errorList,
  datasetId,
  onRetrain,
  onEdit,
  onDelete
}: {
  errorList: DatasetTrainingSchemaType[];
  datasetId: string;
  onRetrain: (data: { datasetId: string; dataId: string }) => void;
  onEdit: (data: { datasetId: string; dataId: string }) => void;
  onDelete: (data: { datasetId: string; dataId: string }) => void;
}) => {
  const { t } = useTranslation();

  if (!errorList?.length) {
    return (
      <Center textAlign="center" py={10} color="gray.500">
        {t('dataset:dataset.No_Error')}
      </Center>
    );
  }

  return (
    <TableContainer overflowY={'auto'} fontSize={'12px'} maxH={'400px'}>
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
                    onClick={() => onRetrain({ datasetId, dataId: item._id })}
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
                    onClick={() => onEdit({ datasetId, dataId: item._id })}
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
                    onClick={() => onDelete({ datasetId, dataId: item._id })}
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
  const [editChunk, setEditChunk] = useState<getTrainingDataDetailResponse>(undefined);

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

  const { runAsync: deleteData, loading: deleteLoading } = useRequest2(
    (data: { datasetId: string; dataId: string }) => {
      return deleteTrainingData(data);
    },
    {
      manual: true
    }
  );

  const { runAsync: updateData, loading: updateLoading } = useRequest2(
    (data: { datasetId: string; dataId: string; q?: string; a?: string }) => {
      return updateTrainingData(data);
    },
    {
      manual: true
    }
  );

  const { runAsync: getData, loading: getDataLoading } = useRequest2(
    (data: { datasetId: string; dataId: string }) => {
      setPollingInterval(0);
      return getTrainingDataDetail(data);
    },
    {
      manual: true,
      onSuccess: (data) => {
        setEditChunk(data);
      }
    }
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="common/running"
      title={t('dataset:dataset.Training Process')}
      minW={['90vw', '712px']}
      isLoading={(isFirstLoading && loading) || deleteLoading || updateLoading || getDataLoading}
    >
      <ModalBody px={9} minH={['90vh', '500px']}>
        {editChunk ? (
          <EditView
            editChunk={editChunk}
            onCancel={() => setEditChunk(undefined)}
            onSave={(data) => {
              updateData({
                datasetId,
                dataId: editChunk._id,
                ...data
              });
              setEditChunk(undefined);
            }}
          />
        ) : (
          <>
            <FillRowTabs
              py={1}
              mb={6}
              value={tab}
              onChange={(e) => setTab(e as 'states' | 'errors')}
              list={[
                { label: t('dataset:dataset.Training Process'), value: 'states' },
                {
                  label: t('dataset:dataset.Training_Errors', {
                    count: trainingDetail?.errorList?.total || 0
                  }),
                  value: 'errors'
                }
              ]}
            />
            {tab === 'states' && trainingDetail && <ProgressView trainingDetail={trainingDetail} />}
            {tab === 'errors' && trainingDetail?.errorList?.data && (
              <ErrorView
                errorList={trainingDetail.errorList.data}
                datasetId={datasetId}
                onRetrain={updateData}
                onEdit={getData}
                onDelete={deleteData}
              />
            )}
          </>
        )}
      </ModalBody>
    </MyModal>
  );
};

export default TrainingStates;
