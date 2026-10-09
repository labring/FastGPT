import { Box, Flex } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useTranslation } from 'next-i18next';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useMemo, useState } from 'react';
import { useDatasetStatusPolling } from '@/web/core/dataset/hooks/useDatasetStatusPolling';
import { getDatasetCollectionTrainingDetail } from '@/web/core/dataset/api/collection';
import { DatasetCollectionDataProcessModeEnum } from '@fastgpt/global/core/dataset/constants';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { TrainingProcess } from '@/web/core/dataset/constants';
import type { GetCollectionTrainingDetailResponseType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import type { Permission } from '@fastgpt/global/support/permission/controller';
import React from 'react';
import TrainingErrorList from './TrainingErrorList';
import {
  getTrainingStepStatus,
  isTrainingDetailReady,
  isTrainingStepHighlighted,
  TrainingStatus
} from './trainingStatesUtils';

/** 按导入或某一种重建模式展示独立链路，避免把重建误画成导入的后续阶段。 */
const ProgressView = ({
  trainingDetail,
  rebuildMode
}: {
  trainingDetail: GetCollectionTrainingDetailResponseType;
  rebuildMode?: TrainingModeEnum.rebuildIndex | TrainingModeEnum.rebuildSynonym;
}) => {
  const { t } = useTranslation();
  const statesArray = useMemo(() => {
    const steps = (() => {
      if (rebuildMode) {
        return [
          {
            mode: rebuildMode,
            label:
              rebuildMode === TrainingModeEnum.rebuildIndex
                ? t('dataset:process.Index_Rebuild')
                : t('dataset:process.Synonym_Rebuild')
          }
        ];
      }
      return [
        { mode: TrainingModeEnum.parse, label: t(TrainingProcess.parsing.label) },
        ...(trainingDetail.trainingType === DatasetCollectionDataProcessModeEnum.imageParse
          ? [{ mode: TrainingModeEnum.imageParse, label: t(TrainingProcess.parseImage.label) }]
          : []),
        ...(trainingDetail.trainingType === DatasetCollectionDataProcessModeEnum.qa
          ? [{ mode: TrainingModeEnum.qa, label: t(TrainingProcess.getQA.label) }]
          : []),
        ...(trainingDetail.advancedTraining.imageIndex
          ? [{ mode: TrainingModeEnum.image, label: t(TrainingProcess.imageIndex.label) }]
          : []),
        ...(trainingDetail.advancedTraining.autoIndexes
          ? [{ mode: TrainingModeEnum.auto, label: t(TrainingProcess.autoIndex.label) }]
          : []),
        { mode: TrainingModeEnum.index, label: t(TrainingProcess.vectorizing.label) }
      ];
    })();
    const modeOrder = steps.map(({ mode }) => mode);
    const isReady = isTrainingDetailReady(trainingDetail, modeOrder);
    const states: {
      label: string;
      statusText?: string;
      status: TrainingStatus;
      errorCount: number;
    }[] = [];

    steps.forEach(({ mode, label }) => {
      const statusText = (() => {
        if (isReady) return;
        // 重建待入队和已入队的数据合并展示，后台仍保留各自真实状态。
        if (rebuildMode) {
          const count = trainingDetail.queuedCounts[mode] + trainingDetail.trainingCounts[mode];
          return count > 0 ? t('dataset:dataset.Training_Count', { count }) : undefined;
        }
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
      })();
      const status = getTrainingStepStatus({ trainingDetail, mode, modeOrder });
      states.push({ label, statusText, status, errorCount: trainingDetail.errorCounts[mode] });
    });
    states.push({
      errorCount: 0,
      label: t('dataset:process.Is_Ready'),
      status: isReady ? TrainingStatus.Ready : TrainingStatus.NotStart,
      statusText: isReady
        ? undefined
        : t('dataset:training_ready', { count: trainingDetail.trainedCount })
    });
    return states;
  }, [trainingDetail, rebuildMode, t]);

  return (
    <Flex flexDirection={'column'} gap={6}>
      {statesArray.map((item, index) => {
        const isHighlighted = isTrainingStepHighlighted(item.status);
        const isActive =
          item.status === TrainingStatus.Queued || item.status === TrainingStatus.Running;

        return (
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
              {...(isHighlighted && {
                bg: 'primary.600',
                borderColor: 'primary.600'
              })}
              {...(isActive && {
                boxShadow: '0 0 0 4px var(--Royal-Blue-100, #E1EAFF)'
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
                item.status === TrainingStatus.Error
                  ? 'red.50'
                  : isHighlighted
                    ? 'primary.50'
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
        );
      })}
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
  const [seenFlows, setSeenFlows] = useState({
    import: false,
    rebuildIndex: false,
    rebuildSynonym: false
  });

  /** 按实际任务及失败记录判定链路，不使用集合最初导入的配置推断重建模式。 */
  const getFlows = (detail: GetCollectionTrainingDetailResponseType) => {
    const hasMode = (mode: TrainingModeEnum) =>
      detail.queuedCounts[mode] + detail.trainingCounts[mode] + detail.errorCounts[mode] > 0;
    return {
      import: Object.values(TrainingModeEnum).some(
        (mode) =>
          ![TrainingModeEnum.rebuildIndex, TrainingModeEnum.rebuildSynonym].includes(mode) &&
          hasMode(mode)
      ),
      rebuildIndex: hasMode(TrainingModeEnum.rebuildIndex),
      rebuildSynonym: hasMode(TrainingModeEnum.rebuildSynonym)
    };
  };

  const {
    data: trainingDetail,
    loading,
    run: refreshTrainingDetail
  } = useDatasetStatusPolling(() => getDatasetCollectionTrainingDetail(collectionId), {
    onSuccess: (data) => {
      // 弹窗已打开时保留观察到的链路，完成后仍能看到各阶段打勾。
      const flows = getFlows(data);
      setSeenFlows((previous) => ({
        import: previous.import || flows.import,
        rebuildIndex: previous.rebuildIndex || flows.rebuildIndex,
        rebuildSynonym: previous.rebuildSynonym || flows.rebuildSynonym
      }));
    }
  });

  const errorCounts = Object.values(trainingDetail?.errorCounts || {}).reduce(
    (acc, count) => acc + count,
    0
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={t('dataset:dataset.Training Process')}
      size={'lg'}
      w={'712px'}
      h={'620px'}
      bodyStyles={{ overflow: 'hidden' }}
      isLoading={!trainingDetail && loading && tab === 'states'}
    >
      <Flex align="center" justify="space-between" mb={4} flexShrink={0}>
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
      {tab === 'states' &&
        trainingDetail &&
        (() => {
          const flows = getFlows(trainingDetail);
          const showIndex = flows.rebuildIndex || seenFlows.rebuildIndex;
          const showSynonym = flows.rebuildSynonym || seenFlows.rebuildSynonym;
          const showImport = flows.import || seenFlows.import || (!showIndex && !showSynonym);
          return (
            <Flex flexDirection="column" gap={8} minH={0} overflowY="auto">
              {showImport && <ProgressView trainingDetail={trainingDetail} />}
              {showIndex && (
                <ProgressView
                  trainingDetail={trainingDetail}
                  rebuildMode={TrainingModeEnum.rebuildIndex}
                />
              )}
              {showSynonym && (
                <ProgressView
                  trainingDetail={trainingDetail}
                  rebuildMode={TrainingModeEnum.rebuildSynonym}
                />
              )}
            </Flex>
          );
        })()}
      {tab === 'errors' && (
        <TrainingErrorList
          scope={{ type: 'collection', collectionId }}
          permission={permission}
          onRefresh={refreshTrainingDetail}
          onClose={onClose}
          showFooter={errorCounts > 0}
        />
      )}
    </MyModal>
  );
};

export default TrainingStates;
