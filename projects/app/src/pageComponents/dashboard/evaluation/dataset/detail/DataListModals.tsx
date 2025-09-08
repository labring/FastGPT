import React from 'react';
import {
  Box,
  Button,
  Text,
  HStack,
  VStack,
  Alert,
  AlertIcon,
  ModalBody,
  ModalFooter
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import EditDataModal from './EditDataModal';
import IntelligentGeneration from '../IntelligentGeneration';
import ManualAddDataModal from './ManualAddDataModal';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useDataListContext } from './DataListContext';
import { useSystemStore } from '@/web/common/system/useSystemStore';

interface DataListModalsProps {
  total: number;
}

const DataListModals: React.FC<DataListModalsProps> = ({ total }) => {
  const { t } = useTranslation();
  const { llmModelList } = useSystemStore();

  const {
    // 编辑数据弹窗相关
    isEditModalOpen,
    onEditModalClose,
    selectedItem,
    handleSaveData,
    handleSaveAndNext,

    // 质量评估弹窗相关
    isQualityEvaluationModalOpen,
    onQualityEvaluationModalClose,
    handleQualityEvaluationConfirm,

    // 智能生成弹窗相关
    isIntelligentGenerationModalOpen,
    onIntelligentGenerationModalClose,
    handleIntelligentGenerationConfirm,

    // 手动新增数据弹窗相关
    isManualAddModalOpen,
    onManualAddModalClose,
    handleManualAddConfirm,

    // 设置弹窗相关
    isSettingsModalOpen,
    onSettingsModalClose,
    handleSettingsConfirm,
    evaluationModel,
    setEvaluationModel
  } = useDataListContext();

  return (
    <>
      {/* 编辑数据弹窗 */}
      {selectedItem && (
        <EditDataModal
          isOpen={isEditModalOpen}
          onClose={onEditModalClose}
          onSave={handleSaveData}
          onSaveAndNext={handleSaveAndNext}
          evaluationStatus={selectedItem.status}
          evaluationResult={selectedItem.answer}
          defaultQuestion={selectedItem.question}
          defaultReferenceAnswer={selectedItem.answer}
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
            {t('dashboard_evaluation:confirm_quality_evaluation')} ({total}){' '}
            {t('dashboard_evaluation:quality_evaluation_question')}?
          </Text>
          <HStack spacing={3} justify="flex-end">
            <Button size="sm" variant="outline" onClick={onQualityEvaluationModalClose}>
              {t('dashboard_evaluation:cancel')}
            </Button>
            <Button size="sm" colorScheme="blue" onClick={handleQualityEvaluationConfirm}>
              {t('dashboard_evaluation:start_evaluation')}
            </Button>
          </HStack>
        </Box>
      </MyModal>

      {/* 智能生成弹窗 */}
      <IntelligentGeneration
        isOpen={isIntelligentGenerationModalOpen}
        onClose={onIntelligentGenerationModalClose}
        onConfirm={handleIntelligentGenerationConfirm}
        scene="data"
      />

      {/* 手动新增数据弹窗 */}
      <ManualAddDataModal
        isOpen={isManualAddModalOpen}
        onClose={onManualAddModalClose}
        onConfirm={handleManualAddConfirm}
      />

      {/* 设置弹窗 */}
      <MyModal
        isOpen={isSettingsModalOpen}
        onClose={onSettingsModalClose}
        iconSrc="common/settingLight"
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
            >
              <AlertIcon color="blue.500" />
              <Text fontSize="14px" color="blue.700">
                {t('dashboard_evaluation:model_change_notice')}
              </Text>
            </Alert>
            {/* 评测模型选择 */}
            <Box>
              <Text fontSize="14px" fontWeight="medium" color="myGray.900" mb={2}>
                <Text as="span" color="red.500">
                  *
                </Text>
                {t('dashboard_evaluation:evaluation_model')}
              </Text>
              <AIModelSelector
                bg="myGray.50"
                value={evaluationModel}
                list={llmModelList.map((item) => ({
                  value: item.model,
                  label: item.name
                }))}
                onChange={(value) => setEvaluationModel(value)}
                placeholder={t('dashboard_evaluation:select_evaluation_model')}
              />
            </Box>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="whiteBase" mr={4} onClick={onSettingsModalClose}>
            {t('dashboard_evaluation:cancel')}
          </Button>
          <Button variant="primary" isDisabled={!evaluationModel} onClick={handleSettingsConfirm}>
            {t('dashboard_evaluation:confirm')}
          </Button>
        </ModalFooter>
      </MyModal>
    </>
  );
};

export default React.memo(DataListModals);
