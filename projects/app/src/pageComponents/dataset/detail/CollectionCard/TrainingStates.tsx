import { Box, Flex, ModalBody } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useMemo, useState } from 'react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getDatasetCollectionTrainingDetail } from '@/web/core/dataset/api/collection';
import { DatasetCollectionDataProcessModeEnum } from '@fastgpt/global/core/dataset/constants';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { TrainingProcess } from '@/web/core/dataset/constants';
import type { GetCollectionTrainingDetailResponseType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import type { Permission } from '@fastgpt/global/support/permission/controller';
import React from 'react';
import TrainingErrorList from './TrainingErrorList';

enum TrainingStatus {
  NotStart = 'NotStart',
  Queued = 'Queued', // wait count>0
  Running = 'Running', // wait count=0; training count>0.
  Ready = 'Ready',
  Error = 'Error'
}

const ProgressView = ({
  trainingDetail
}: {
  trainingDetail: GetCollectionTrainingDetailResponseType;
}) => {
  const { t } = useTranslation();

  const isQA = trainingDetail?.trainingType === DatasetCollectionDataProcessModeEnum.qa;
  const isImageParse =
    trainingDetail?.trainingType === DatasetCollectionDataProcessModeEnum.imageParse;
  const isImageIndex = trainingDetail.advancedTraining.imageIndex;
  const isAutoIndexes = trainingDetail.advancedTraining.autoIndexes;

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
        statusText: getStatusText(TrainingModeEnum.parse),
        status: getTrainingStatus({
          errorCount: trainingDetail.errorCounts.parse
        }),
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
      ...(isImageIndex
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
      ...(isAutoIndexes
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
    isImageIndex,
    isAutoIndexes,
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

const TrainingStates = ({
  collectionId,
  permission,
  defaultTab = 'states',
  onClose
}: {
  collectionId: string;
  permission: Permission;
  defaultTab?: 'states' | 'errors';
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<typeof defaultTab>(defaultTab);

  const {
    data: trainingDetail,
    loading,
    runAsync: refreshTrainingDetail
  } = useRequest(() => getDatasetCollectionTrainingDetail(collectionId), {
    pollingInterval: 5000,
    pollingWhenHidden: false,
    manual: false
  });

  const errorCounts = Object.values(trainingDetail?.errorCounts || {}).reduce(
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
        <Flex align="center" justify="space-between" mb={4}>
          <FillRowTabs
            py={1}
            value={tab}
            onChange={(e) => setTab(e as 'states' | 'errors')}
            list={[
              { label: t('dataset:dataset.Training Process'), value: 'states' },
              {
                label: t('dataset:dataset.Training_Errors', { count: errorCounts }),
                value: 'errors'
              }
            ]}
          />
        </Flex>
        {tab === 'states' && trainingDetail && <ProgressView trainingDetail={trainingDetail} />}
        {tab === 'errors' && (
          <TrainingErrorList
            scope={{ type: 'collection', collectionId }}
            permission={permission}
            onRefresh={refreshTrainingDetail}
            onClose={onClose}
            showFooter={errorCounts > 0}
          />
        )}
      </ModalBody>
    </MyModal>
  );
};

export default TrainingStates;
