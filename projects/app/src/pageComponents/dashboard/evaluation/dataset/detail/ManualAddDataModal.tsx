import React, { useState } from 'react';
import {
  Button,
  VStack,
  FormControl,
  Textarea,
  Switch,
  HStack,
  ModalBody,
  ModalFooter,
  FormErrorMessage,
  Flex
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/common/MyModal';
import AIModelSelector from '@/components/Select/AIModelSelector';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

interface ManualAddDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: ManualAddDataFormData) => void;
}

interface ManualAddDataFormData {
  question: string;
  referenceAnswer: string;
  autoEvaluate: boolean;
  evaluationModel: string;
}

const ManualAddDataModal: React.FC<ManualAddDataModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const { t } = useTranslation();
  const { llmModelList } = useSystemStore();
  const [autoEvaluate, setAutoEvaluate] = useState(true);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset
  } = useForm<ManualAddDataFormData>({
    defaultValues: {
      question: '',
      referenceAnswer: '',
      autoEvaluate: true,
      evaluationModel: llmModelList?.[0]?.model || ''
    }
  });

  const watchedAutoEvaluate = watch('autoEvaluate');
  const watchedEvaluationModel = watch('evaluationModel');

  const handleClose = () => {
    reset();
    setAutoEvaluate(true);
    onClose();
  };

  const onSubmit = (data: ManualAddDataFormData) => {
    onConfirm(data);
    handleClose();
  };

  const handleAutoEvaluateChange = (checked: boolean) => {
    setAutoEvaluate(checked);
    setValue('autoEvaluate', checked);
  };

  return (
    <MyModal
      isOpen={isOpen}
      onClose={handleClose}
      iconSrc="common/addLight"
      title={t('dashboard_evaluation:manual_add_data')}
      w="600px"
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <ModalBody>
          <VStack spacing={4} align="stretch" px={2}>
            {/* 问题输入 */}
            <FormControl isRequired isInvalid={!!errors.question}>
              <FormLabel required fontSize="14px" fontWeight="medium" color="myGray.900">
                {t('dashboard_evaluation:question')}
              </FormLabel>
              <Textarea
                placeholder={t('dashboard_evaluation:max_3000_chars')}
                bg="myGray.50"
                minH="120px"
                maxLength={3000}
                resize="vertical"
                {...register('question', {
                  required: t('dashboard_evaluation:please_enter_question'),
                  maxLength: {
                    value: 3000,
                    message: t('dashboard_evaluation:question_max_3000_chars')
                  }
                })}
              />
              {errors.question && <FormErrorMessage>{errors.question.message}</FormErrorMessage>}
            </FormControl>

            {/* 参考答案输入 */}
            <FormControl isRequired isInvalid={!!errors.referenceAnswer}>
              <FormLabel required fontSize="14px" fontWeight="medium" color="myGray.900">
                {t('dashboard_evaluation:reference_answer')}
              </FormLabel>
              <Textarea
                placeholder={t('dashboard_evaluation:max_3000_chars')}
                bg="myGray.50"
                minH="120px"
                maxLength={3000}
                resize="vertical"
                {...register('referenceAnswer', {
                  required: t('dashboard_evaluation:please_enter_reference_answer'),
                  maxLength: {
                    value: 3000,
                    message: t('dashboard_evaluation:reference_answer_max_3000_chars')
                  }
                })}
              />
              {errors.referenceAnswer && (
                <FormErrorMessage>{errors.referenceAnswer.message}</FormErrorMessage>
              )}
            </FormControl>

            {/* 自动进行数据质量评测开关 */}
            <FormControl>
              <Flex align="center">
                <HStack>
                  <FormLabel required>
                    {t('dashboard_evaluation:auto_quality_evaluation')}
                  </FormLabel>
                  <QuestionTip label={t('dashboard_evaluation:quality_evaluation_tip')} />
                </HStack>
                <Switch
                  ml={4}
                  isChecked={autoEvaluate}
                  onChange={(e) => handleAutoEvaluateChange(e.target.checked)}
                  colorScheme="blue"
                />
              </Flex>
            </FormControl>

            {/* 质量评测模型选择 */}
            {watchedAutoEvaluate && (
              <FormControl isRequired isInvalid={!!errors.evaluationModel}>
                <FormLabel required fontSize="14px" fontWeight="medium" color="myGray.900">
                  {t('dashboard_evaluation:quality_evaluation_model')}
                </FormLabel>
                <AIModelSelector
                  bg="myGray.50"
                  value={watchedEvaluationModel}
                  list={llmModelList.map((item) => ({
                    value: item.model,
                    label: item.name
                  }))}
                  onChange={(value) => setValue('evaluationModel', value)}
                  placeholder={t('dashboard_evaluation:please_select_evaluation_model')}
                />
                {errors.evaluationModel && (
                  <FormErrorMessage>{errors.evaluationModel.message}</FormErrorMessage>
                )}
              </FormControl>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="whiteBase" mr={4} onClick={handleClose}>
            {t('dashboard_evaluation:cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            isDisabled={
              !watch('question') ||
              !watch('referenceAnswer') ||
              (watchedAutoEvaluate && !watchedEvaluationModel)
            }
          >
            {t('dashboard_evaluation:confirm')}
          </Button>
        </ModalFooter>
      </form>
    </MyModal>
  );
};

export default React.memo(ManualAddDataModal);
