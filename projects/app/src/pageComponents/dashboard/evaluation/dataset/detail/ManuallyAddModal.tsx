import React, { useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  Flex,
  ModalBody,
  ModalFooter,
  VStack,
  Switch,
  HStack
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/common/MyModal';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { postCreateEvaluationDatasetData } from '@/web/core/evaluation/dataset';

/**
 * 手动新增数据表单数据接口
 */
export interface ManuallyAddForm {
  question: string;
  answer: string;
  autoEvaluation: boolean;
  evaluationModel: string;
}

/**
 * 手动新增数据弹窗组件属性接口
 */
interface ManuallyAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: (data: ManuallyAddForm) => void;
  collectionId: string;
  defaultValues?: Partial<ManuallyAddForm>;
}

/**
 * 手动新增数据弹窗组件
 * 用于手动添加评测数据
 */
const ManuallyAddModal = ({
  isOpen,
  onClose,
  onConfirm,
  collectionId,
  defaultValues
}: ManuallyAddModalProps) => {
  const { t } = useTranslation();
  const { llmModelList } = useSystemStore();

  const evalModelList = useMemo(() => {
    return llmModelList.filter((item) => item.useInEvaluation);
  }, [llmModelList]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset
  } = useForm<ManuallyAddForm>({
    defaultValues: {
      question: defaultValues?.question || '',
      answer: defaultValues?.answer || '',
      autoEvaluation: defaultValues?.autoEvaluation ?? true,
      evaluationModel: defaultValues?.evaluationModel || evalModelList[0]?.model || ''
    }
  });

  const questionValue = watch('question');
  const answerValue = watch('answer');
  const autoEvaluationValue = watch('autoEvaluation');
  const evaluationModelValue = watch('evaluationModel');

  const { runAsync: handleAddData, loading } = useRequest2(postCreateEvaluationDatasetData, {
    successToast: t('common:add_success')
  });

  // 检查表单是否有效
  const isFormValid = useMemo(() => {
    const basicValid = questionValue.trim() !== '' && answerValue.trim() !== '';
    if (autoEvaluationValue) {
      return basicValid && evaluationModelValue.trim() !== '';
    }
    return basicValid;
  }, [questionValue, answerValue, autoEvaluationValue, evaluationModelValue]);

  // 处理表单提交
  const handleFormSubmit = useCallback(
    async (data: ManuallyAddForm) => {
      const submitData: any = {
        userInput: data.question,
        expectedOutput: data.answer,
        enableQualityEvaluation: data.autoEvaluation,
        collectionId
      };

      // 只有当开启自动评测时才传递评测模型
      if (data.autoEvaluation) {
        submitData.evaluationModel = data.evaluationModel;
      }

      await handleAddData(submitData);
      onConfirm?.(data);
      onClose?.();
      reset();
    },
    [onConfirm, handleAddData, collectionId, onClose, reset]
  );

  return (
    <MyModal
      isOpen={isOpen}
      onClose={onClose}
      iconSrc="common/addLight"
      iconColor="primary.600"
      title={t('dashboard_evaluation:manually_add_data_modal')}
      w={'100%'}
      maxW={['90vw', '600px']}
      isCentered
    >
      <ModalBody>
        <VStack as="form" spacing={6} align="stretch" px={2}>
          {/* 问题 */}
          <Box>
            <FormLabel required mb={1}>
              {t('dashboard_evaluation:question_input_label')}
            </FormLabel>
            <MyTextarea
              bg="myGray.50"
              placeholder={t('dashboard_evaluation:max_chars_3000_placeholder')}
              maxLength={3000}
              minH={120}
              maxH={200}
              {...register('question', { required: true })}
              isInvalid={!!errors.question}
            />
          </Box>

          {/* 参考答案 */}
          <Box>
            <FormLabel required mb={1}>
              {t('dashboard_evaluation:reference_answer_input_label')}
            </FormLabel>
            <MyTextarea
              bg="myGray.50"
              placeholder={t('dashboard_evaluation:max_chars_3000_placeholder')}
              maxLength={3000}
              minH={120}
              maxH={200}
              {...register('answer', { required: true })}
              isInvalid={!!errors.answer}
            />
          </Box>

          {/* 新增后自动进行数据质量评测 */}
          <HStack>
            <Flex align="center" mb={1}>
              <FormLabel required mb={0}>
                {t('dashboard_evaluation:auto_quality_eval_after_add')}
              </FormLabel>
              <QuestionTip label={t('dashboard_evaluation:auto_quality_eval_add_tip')} ml={1} />
            </Flex>
            <Switch
              isChecked={autoEvaluationValue}
              onChange={(e) => setValue('autoEvaluation', e.target.checked)}
              colorScheme="blue"
            />
          </HStack>

          {/* 质量评测模型 - 仅在开启自动评测时显示 */}
          {autoEvaluationValue && (
            <Box>
              <FormLabel required mb={1}>
                {t('dashboard_evaluation:quality_eval_model_label')}
              </FormLabel>
              <AIModelSelector
                bg="myGray.50"
                value={evaluationModelValue}
                list={evalModelList.map((item) => ({
                  value: item.model,
                  label: item.name
                }))}
                onChange={(value) => setValue('evaluationModel', value)}
                placeholder={t('dashboard_evaluation:select_quality_eval_model_placeholder')}
              />
            </Box>
          )}
        </VStack>
      </ModalBody>

      <ModalFooter>
        <Button variant="whiteBase" mr={4} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button
          variant="primary"
          isLoading={loading}
          isDisabled={!isFormValid}
          onClick={handleSubmit(handleFormSubmit)}
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(ManuallyAddModal);
