import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Text,
  HStack,
  VStack,
  Alert,
  ModalBody,
  ModalFooter,
  Flex
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import EditDataModal from './EditDataModal';
import IntelligentGeneration from '../IntelligentGeneration';
import ManualAddDataModal from './ManuallyAddModal';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useDataListContext } from './DataListContext';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  postEvaluationDatasetQualityAssessmentBatch,
  updateEvaluationDatasetData,
  updateEvaluationDataset,
  getEvaluationDatasetCollectionDetail
} from '@/web/core/evaluation/dataset';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIcon from '@fastgpt/web/components/common/Icon';

interface DataListModalsProps {
  total: number;
  refreshList: () => void;
}

const DataListModals: React.FC<DataListModalsProps> = ({ total, refreshList }) => {
  const { t } = useTranslation();

  const {
    // 编辑数据弹窗相关
    isEditModalOpen,
    onEditModalClose,
    selectedItem,
    setSelectedItem,

    // 质量评估弹窗相关
    isQualityEvaluationModalOpen,
    onQualityEvaluationModalClose,

    // 智能生成弹窗相关
    isIntelligentGenerationModalOpen,
    onIntelligentGenerationModalClose,

    // 手动新增数据弹窗相关
    isManualAddModalOpen,
    onManualAddModalClose,

    // 设置弹窗相关
    isSettingsModalOpen,
    onSettingsModalClose,

    // 获取数据集ID和刷新数据的方法
    collectionId,
    collectionName,
    evaluationDataList
  } = useDataListContext();

  // 批量质量评估请求
  const { runAsync: runQualityAssessmentBatch, loading: isQualityAssessmentLoading } = useRequest2(
    postEvaluationDatasetQualityAssessmentBatch,
    {
      successToast: t('common:submit_success')
    }
  );

  // 修改测评数据
  const { runAsync: updateDataFn } = useRequest2(updateEvaluationDatasetData, {
    successToast: t('common:update_success')
  });

  // 修改评估模型
  const { runAsync: updateModelSettingFn, loading: isUpdating } = useRequest2(
    updateEvaluationDataset,
    {
      successToast: t('common:update_success')
    }
  );
  const { llmModelList } = useSystemStore();
  const evalModelList = useMemo(() => {
    return llmModelList.filter((item) => item.useInEvaluation);
  }, [llmModelList]);
  const [evaluationModel, setEvaluationModel] = useState<string>('');

  // 获取数据集详情
  const { runAsync: getCollectionDetail } = useRequest2(getEvaluationDatasetCollectionDetail);

  // 初始化评测模型
  useEffect(() => {
    const initEvaluationModel = async () => {
      const detail = await getCollectionDetail(collectionId);
      setEvaluationModel(detail.evaluationModel || evalModelList[0]?.model || '');
    };

    if (collectionId && evalModelList.length > 0) {
      initEvaluationModel();
    }
  }, [collectionId, evalModelList, getCollectionDetail, isSettingsModalOpen]);

  const handleSettingsConfirm = async () => {
    await updateModelSettingFn({ collectionId, evaluationModel });
    onSettingsModalClose();
  };

  const handleGoNextData = () => {
    if (!selectedItem) return;
    // 自动打开下一条数据
    const currentIndex = evaluationDataList.findIndex((item) => item._id === selectedItem?._id);
    if (currentIndex < evaluationDataList.length - 1) {
      const nextItem = evaluationDataList[currentIndex + 1];
      setSelectedItem(nextItem);
    } else {
      onEditModalClose();
    }
  };

  const handleSaveUpdateData = async (
    formData: {
      question: string;
      referenceAnswer: string;
      metadata: Record<string, any>;
    },
    isGoNext = false
  ) => {
    const { question, referenceAnswer, metadata } = formData;
    await updateDataFn({
      dataId: selectedItem._id,
      userInput: question,
      expectedOutput: referenceAnswer,
      metadata
    });
    isGoNext && handleGoNextData();
    !isGoNext && onEditModalClose();
    refreshList?.();
  };

  // 处理质量评估确认
  const handleQualityEvaluationConfirmWithRequest = async () => {
    await runQualityAssessmentBatch({
      collectionId
    });
    onQualityEvaluationModalClose();
    refreshList?.();
  };

  // 处理智能生成确认
  const handleIntelligentGeneration = async () => {
    onIntelligentGenerationModalClose();
    refreshList?.();
  };

  return (
    <>
      {/* 编辑数据弹窗 */}
      {selectedItem && (
        <EditDataModal
          isOpen={isEditModalOpen}
          onClose={onEditModalClose}
          onSave={handleSaveUpdateData}
          formData={selectedItem}
        />
      )}

      {/* 质量评估确认弹窗 */}
      <MyModal
        isOpen={isQualityEvaluationModalOpen}
        onClose={onQualityEvaluationModalClose}
        iconSrc="common/warn"
        title={t('dashboard_evaluation:confirm')}
        maxW="400px"
      >
        <Box p={6}>
          <Text fontSize="14px" color="myGray.900" mb={6}>
            {t('dashboard_evaluation:confirm_quality_evaluation', { total })}
          </Text>
          <HStack spacing={3} justify="flex-end">
            <Button size="sm" variant="outline" onClick={onQualityEvaluationModalClose}>
              {t('dashboard_evaluation:cancel')}
            </Button>
            <Button
              size="sm"
              colorScheme="blue"
              onClick={handleQualityEvaluationConfirmWithRequest}
              isLoading={isQualityAssessmentLoading}
            >
              {t('dashboard_evaluation:start_evaluation')}
            </Button>
          </HStack>
        </Box>
      </MyModal>

      {/* 智能生成弹窗 */}
      <IntelligentGeneration
        isOpen={isIntelligentGenerationModalOpen}
        onClose={onIntelligentGenerationModalClose}
        onConfirm={handleIntelligentGeneration}
        defaultValues={{ collectionId }}
        scene="data"
      />

      {/* 手动新增数据弹窗 */}
      <ManualAddDataModal
        isOpen={isManualAddModalOpen}
        collectionId={collectionId}
        onClose={onManualAddModalClose}
        onConfirm={refreshList}
      />

      {/* 设置弹窗 */}
      <MyModal
        isOpen={isSettingsModalOpen}
        onClose={onSettingsModalClose}
        iconSrc="common/setting"
        iconColor="primary.600"
        title={t('dashboard_evaluation:settings')}
        w="500px"
      >
        <ModalBody>
          <VStack spacing={4} align="stretch" px={2}>
            {/* 提示信息 */}
            <Alert
              status="info"
              borderRadius="md"
              bg="blue.50"
              border="1px solid"
              borderColor="blue.200"
              py={3}
              px={6}
            >
              <Flex alignItems={'center'}>
                <MyIcon color={'primary.600'} name="common/info" w={4} h={4} mr={2}></MyIcon>
                <Text fontSize="14px" color="myGray.600">
                  {t('dashboard_evaluation:model_change_notice')}
                </Text>
              </Flex>
            </Alert>
            {/* 评测模型选择 */}
            <HStack w={'100%'}>
              <FormLabel required>
                <Text fontSize="14px" fontWeight="medium" color="myGray.900" mb={2}>
                  {t('dashboard_evaluation:evaluation_model')}
                </Text>
              </FormLabel>
              <Box flex={1}>
                <AIModelSelector
                  bg="myGray.50"
                  value={evaluationModel}
                  list={evalModelList.map((item) => ({
                    value: item.model,
                    label: item.name
                  }))}
                  onChange={(value) => setEvaluationModel(value)}
                  placeholder={t('dashboard_evaluation:select_evaluation_model')}
                />
              </Box>
            </HStack>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="whiteBase" mr={4} onClick={onSettingsModalClose}>
            {t('dashboard_evaluation:cancel')}
          </Button>
          <Button
            variant="primary"
            isDisabled={!evaluationModel}
            onClick={handleSettingsConfirm}
            isLoading={isUpdating}
          >
            {t('dashboard_evaluation:confirm')}
          </Button>
        </ModalFooter>
      </MyModal>
    </>
  );
};

export default React.memo(DataListModals);
