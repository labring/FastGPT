import {
  ModalBody,
  FormControl,
  FormLabel,
  Textarea,
  Button,
  HStack,
  ModalFooter
} from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal/index';
import React, { useState, useEffect } from 'react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { modifiableEvaluationStatusOptions, EvaluationStatus } from './const';

interface ModifyEvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: { result: EvaluationStatus; reason: string }) => void;
  onDelete?: () => void;
  defaultValues?: {
    evaluationStatus?: EvaluationStatus;
    evaluationResult?: string;
  };
}

const ModifyEvaluationModal = ({
  isOpen,
  onClose,
  onConfirm,
  defaultValues
}: ModifyEvaluationModalProps) => {
  const { t } = useTranslation();

  const [evaluationData, setEvaluationData] = useState<{
    evaluationResult: string;
    evaluationStatus: EvaluationStatus;
  }>(() => ({
    evaluationStatus: defaultValues?.evaluationStatus || EvaluationStatus.NotEvaluated,
    evaluationResult: ''
  }));

  // 监听 defaultValues 的变化，更新 evaluationData
  useEffect(() => {
    if (defaultValues) {
      setEvaluationData({
        evaluationStatus: defaultValues.evaluationStatus || EvaluationStatus.NotEvaluated,
        evaluationResult: defaultValues.evaluationResult || ''
      });
    }
  }, [defaultValues]);

  const handleClose = () => {
    onClose();
  };

  const onSubmit = () => {
    // 如果修改理由为空，设置默认值
    const { evaluationResult, evaluationStatus } = evaluationData;
    const submitData = {
      result: evaluationStatus,
      reason: evaluationResult.trim() || t('dashboard_evaluation:manually_calibrated')
    };

    onConfirm(submitData);
    handleClose();
  };

  return (
    <MyModal
      zIndex={1500}
      isOpen={isOpen}
      onClose={handleClose}
      size="md"
      title={t('dashboard_evaluation:modify_evaluation_result_title')}
    >
      <ModalBody>
        <FormControl mb={4}>
          <FormLabel fontSize="14px" fontWeight="medium" color="myGray.900">
            {t('dashboard_evaluation:evaluation_result_label')}
          </FormLabel>
          <MySelect
            bg={'myGray.50'}
            value={evaluationData.evaluationStatus}
            onChange={(e) => {
              setEvaluationData((pre) => ({
                ...pre,
                evaluationStatus: e
              }));
            }}
            list={modifiableEvaluationStatusOptions}
          />
        </FormControl>

        <FormControl mb={6}>
          <FormLabel fontSize="14px" fontWeight="medium" color="myGray.900">
            {t('dashboard_evaluation:modify_reason_label')}
            {evaluationData.evaluationResult}
          </FormLabel>
          <Textarea
            placeholder={t('dashboard_evaluation:modify_reason_input_placeholder')}
            bg="myGray.50"
            minH="120px"
            resize="vertical"
            value={evaluationData.evaluationResult}
            onChange={(e) => {
              setEvaluationData((pre) => ({
                ...pre,
                evaluationResult: e.target.value
              }));
            }}
          />
        </FormControl>
      </ModalBody>
      <ModalFooter>
        <HStack spacing={3} justify="flex-end">
          <Button variant="outline" onClick={handleClose}>
            {t('common:Cancel')}
          </Button>
          <Button onClick={onSubmit} colorScheme="blue">
            {t('common:Confirm')}
          </Button>
        </HStack>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(ModifyEvaluationModal);
