import {
  Box,
  Button,
  Flex,
  ModalBody,
  ModalFooter,
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
import { TrainingProcess, TrainingText } from '@/web/core/dataset/constants';
import { TrainingErrorItem } from '@/pages/api/core/dataset/collection/trainingDetail';
import { DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';

enum TrainingStatus {
  Normal = 'Normal',
  Error = 'Error',
  InProgress = 'InProgress',
  NotStarted = 'NotStarted'
}

const getProcessString = (trainingAmount: number, trainedAmount: number) => {
  return `${trainedAmount} / ${trainingAmount + trainedAmount}`;
};

const getProcessValue = (trainingAmount: number, trainedAmount: number) => {
  return (trainedAmount / (trainingAmount + trainedAmount)) * 100;
};

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

const tagStyle = {
  showDot: true,
  type: 'fill' as const,
  px: 1,
  fontSize: 'mini',
  fontWeight: 'medium',
  rounded: 'full',
  h: 5
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
  const [editQ, setEditQ] = useState('');
  const [editA, setEditA] = useState('');

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

  const imageTrainingAmount = trainingDetail?.trainingCounts?.image || 0;
  const imageTrainedAmount = trainingDetail?.indexesCounts?.image || 0;
  const autoTrainingAmount = trainingDetail?.trainingCounts?.auto || 0;
  const autoTrainedAmount = trainingDetail?.indexesCounts?.auto || 0;
  const chunkTrainingAmount = trainingDetail?.trainingCounts?.chunk || 0;
  const chunkTrainedAmount = trainingDetail?.indexesCounts?.default || 0;
  const qaTrainingAmount = trainingDetail?.trainingCounts?.qa || 0;

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
            label: TrainingProcess.getQA.label,
            progress: qaTrainingAmount ? `${qaTrainingAmount} 组训练中` : '已完成',
            status: getTrainingStatus({
              mode: TrainingModeEnum.qa,
              errorList: trainingDetail?.errorList,
              trainingAmount: qaTrainingAmount,
              trainedAmount: 0
            })
          }
        ]
      : []),
    ...(trainingDetail?.advancedTraining.imageIndex && !isQA
      ? [
          {
            label: TrainingProcess.imageIndex.label,
            progress: getProcessString(imageTrainingAmount, imageTrainedAmount),
            progressValue: getProcessValue(imageTrainingAmount, imageTrainedAmount),
            status: getTrainingStatus({
              mode: TrainingModeEnum.image,
              errorList: trainingDetail?.errorList,
              trainingAmount: imageTrainingAmount,
              trainedAmount: imageTrainedAmount
            })
          }
        ]
      : []),
    ...(trainingDetail?.advancedTraining.autoIndexes && !isQA
      ? [
          {
            label: TrainingProcess.autoIndex.label,
            progress: getProcessString(autoTrainingAmount, autoTrainedAmount),
            progressValue: getProcessValue(autoTrainingAmount, autoTrainedAmount),
            status: getTrainingStatus({
              mode: TrainingModeEnum.auto,
              errorList: trainingDetail?.errorList,
              trainingAmount: autoTrainingAmount,
              trainedAmount: autoTrainedAmount
            })
          }
        ]
      : []),
    {
      label: TrainingProcess.vectorizing.label,
      progress: getProcessString(
        chunkTrainingAmount + imageTrainingAmount + autoTrainingAmount,
        chunkTrainedAmount + imageTrainedAmount + autoTrainedAmount
      ),
      progressValue: getProcessValue(
        chunkTrainingAmount + imageTrainingAmount + autoTrainingAmount,
        chunkTrainedAmount + imageTrainedAmount + autoTrainedAmount
      ),
      status: getTrainingStatus({
        mode: TrainingModeEnum.chunk,
        errorList: trainingDetail?.errorList,
        trainingAmount: chunkTrainingAmount + imageTrainingAmount + autoTrainingAmount,
        trainedAmount: chunkTrainedAmount + imageTrainedAmount + autoTrainedAmount
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
        setEditQ(data?.q || '');
        setEditA(data?.a || '');
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
      <ModalBody px={9}>
        {editChunk ? (
          <Flex flexDirection={'column'} gap={4}>
            {editChunk.a && <Box>q</Box>}
            <MyTextarea
              value={editQ}
              minH={editChunk.a ? 200 : 400}
              onChange={(e) => setEditQ(e.target.value)}
            />
            {editChunk.a && (
              <>
                <Box>a</Box>
                <MyTextarea value={editA} minH={200} onChange={(e) => setEditA(e.target.value)} />
              </>
            )}
          </Flex>
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
            {tab === 'states' && (
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
                          color={
                            item.status === TrainingStatus.NotStarted ? 'myGray.400' : 'myGray.900'
                          }
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
                        {item.status === TrainingStatus.InProgress && (
                          <Flex alignItems={'center'} gap={1}>
                            <Spinner size={'xs'} color={'blue.500'} />
                          </Flex>
                        )}
                        <Box flex={1} />
                        <Box
                          fontSize={'14px'}
                          color={
                            item.status === TrainingStatus.NotStarted ? 'myGray.400' : 'myGray.900'
                          }
                        >
                          {item.progress}
                        </Box>
                      </Flex>

                      {item.progressValue !== undefined &&
                        item.status !== TrainingStatus.NotStarted && (
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
            )}
            {tab === 'errors' && !!trainingDetail?.errorList?.data?.length && (
              <TableContainer overflowY={'auto'} fontSize={'12px'} maxH={'500px'}>
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
                    {trainingDetail.errorList.data.map(
                      (item: DatasetTrainingSchemaType, index: number) => (
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
                                onClick={() => {
                                  updateData({
                                    datasetId,
                                    dataId: item._id
                                  });
                                }}
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
                                onClick={async () => {
                                  await getData({
                                    datasetId,
                                    dataId: item._id
                                  });
                                }}
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
                                  deleteData({
                                    datasetId,
                                    dataId: item._id
                                  });
                                }}
                              >
                                {t('dataset:dataset.Delete_Chunk')}
                              </Button>
                            </Flex>
                          </Td>
                        </Tr>
                      )
                    )}
                  </Tbody>
                </Table>
              </TableContainer>
            )}
            {tab === 'errors' && !trainingDetail?.errorList?.data?.length && (
              <Center textAlign="center" py={10} color="gray.500" h={'400px'}>
                {t('dataset:dataset.No_Error')}
              </Center>
            )}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        {editChunk && (
          <>
            <Button
              variant={'outline'}
              mr={4}
              onClick={() => {
                setEditChunk(undefined);
              }}
            >
              {t('common:common.Cancel')}
            </Button>
            <Button
              variant={'primary'}
              onClick={() => {
                updateData({
                  datasetId,
                  dataId: editChunk._id,
                  q: editQ,
                  a: editA
                });

                setEditChunk(undefined);
              }}
            >
              {t('dataset:dataset.ReTrain')}
            </Button>
          </>
        )}
      </ModalFooter>
    </MyModal>
  );
};

export default TrainingStates;
