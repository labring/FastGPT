import React, { useState, useMemo } from 'react';
import {
  ModalBody,
  Box,
  Flex,
  FormControl,
  Textarea,
  Button,
  Text,
  Spinner,
  Badge,
  VStack,
  HStack,
  ModalFooter,
  useDisclosure
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal/index';
import ModifyEvaluationModal from './ModifyEvaluationModal';
import { evaluationStatusMap, EvaluationStatus } from './const';
import {
  postEvaluationDatasetQualityAssessment,
  getEvaluationDatasetDataDetail
} from '@/web/core/evaluation/dataset';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import type { listEvalDatasetDataResponse } from '@fastgpt/global/core/evaluation/dataset/api';

interface EditDataFormData {
  question: string;
  referenceAnswer: string;
}

interface EditDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: EditDataFormData & { metadata: Record<string, any> }, isGoNext?: boolean) => void;
  isLoading?: boolean;
  formData: listEvalDatasetDataResponse;
}

type OprResType = 'startReview' | 'modifyRes' | 'reStart';

interface ReviewBtnType {
  label: string;
  isShow: boolean;
  key: OprResType;
}

const EditDataModal: React.FC<EditDataModalProps> = ({
  isOpen,
  onClose,
  onSave,
  formData,
  isLoading = false
}) => {
  const evaluationStatus = useMemo(
    () => formData?.metadata?.qualityStatus || EvaluationStatus.NotEvaluated,
    [formData]
  );
  const evaluationResult = useMemo(() => formData?.metadata?.qualityReason || '', [formData]);
  const defaultQuestion = useMemo(() => formData?.userInput || '', [formData]);
  const defaultReferenceAnswer = useMemo(() => formData?.expectedOutput || '', [formData]);

  const { t } = useTranslation();
  const [currentEvaluationStatus, setCurrentEvaluationStatus] = useState<EvaluationStatus>(
    formData?.metadata?.qualityStatus || EvaluationStatus.NotEvaluated
  );
  const [currentEvaluationResult, setCurrentEvaluationResult] = useState<string>(
    formData?.metadata?.qualityReason
  );

  const [reviewBtns, setReviewBtns] = useState<ReviewBtnType[]>([
    {
      label: t('dashboard_evaluation:start_evaluation'),
      isShow: true,
      key: 'startReview'
    },
    {
      label: t('dashboard_evaluation:modify_result'),
      isShow: false,
      key: 'modifyRes'
    },
    {
      label: t('dashboard_evaluation:restart_evaluation'),
      isShow: false,
      key: 'reStart'
    }
  ]);

  // 根据评测状态更新按钮显示的公共函数
  const updateButtonsByStatus = (status: EvaluationStatus) => {
    if (status === EvaluationStatus.NotEvaluated) {
      setReviewBtns((prev) =>
        prev.map((btn) => ({
          ...btn,
          isShow: btn.key === 'startReview'
        }))
      );
    } else if (
      status === EvaluationStatus.HighQuality ||
      status === EvaluationStatus.NeedsImprovement ||
      status === EvaluationStatus.Abnormal
    ) {
      setReviewBtns((prev) =>
        prev.map((btn) => ({
          ...btn,
          isShow: btn.key === 'modifyRes' || btn.key === 'reStart'
        }))
      );
    } else if (status === EvaluationStatus.Evaluating || status === EvaluationStatus.Queuing) {
      setReviewBtns((prev) =>
        prev.map((btn) => ({
          ...btn,
          isShow: false
        }))
      );
    }
  };

  const { runAsync: simulateEvaluation, loading: isEvaluating } = useRequest2(
    postEvaluationDatasetQualityAssessment,
    {
      onError() {
        setCurrentEvaluationStatus(formData?.metadata?.qualityStatus);
        setCurrentEvaluationResult(formData?.metadata?.qualityReason);
      }
    }
  );

  // 轮询获取数据详情 - 只有在评测中时才轮询
  useRequest2(() => getEvaluationDatasetDataDetail(formData._id), {
    pollingInterval: 3000,
    pollingWhenHidden: false,
    manual: !isOpen || currentEvaluationStatus !== EvaluationStatus.Evaluating,
    ready: isOpen && !!formData._id && currentEvaluationStatus === EvaluationStatus.Evaluating,
    onSuccess: (data: any) => {
      if (data?.metadata?.qualityStatus !== currentEvaluationStatus) {
        const newStatus = data?.metadata.qualityStatus || EvaluationStatus.NotEvaluated;
        setCurrentEvaluationStatus(newStatus);
        setCurrentEvaluationResult(data?.metadata.qualityReason || '');
        updateButtonsByStatus(newStatus);
      }
    }
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<EditDataFormData>({
    defaultValues: {
      question: defaultQuestion,
      referenceAnswer: defaultReferenceAnswer
    }
  });

  // 当弹窗打开时重置表单数据
  React.useEffect(() => {
    if (isOpen) {
      reset({
        question: defaultQuestion,
        referenceAnswer: defaultReferenceAnswer
      });
      setCurrentEvaluationStatus(evaluationStatus);
      setCurrentEvaluationResult(evaluationResult);

      // 根据评测状态设置按钮显示状态
      updateButtonsByStatus(evaluationStatus);
    }
  }, [isOpen, defaultQuestion, defaultReferenceAnswer, evaluationStatus, evaluationResult, reset]);

  const handleSaveClick = (data: EditDataFormData, isGoNext = false) => {
    onSave(
      {
        ...data,
        metadata: {
          qualityStatus: currentEvaluationStatus,
          qualityReason: currentEvaluationResult
        }
      },
      isGoNext
    );
  };

  const renderEvaluationContent = () => {
    switch (currentEvaluationStatus) {
      case EvaluationStatus.Queuing:
        return (
          <VStack spacing={4} justify="center" h="100%">
            <HStack spacing={3} align="center">
              <MyIcon name="history" w="20px" h="20px" color="gray.500" />
              <Text color="gray.500" fontSize="14px">
                {t(evaluationStatusMap[EvaluationStatus.Queuing])}
              </Text>
            </HStack>
          </VStack>
        );

      case EvaluationStatus.Evaluating:
        return (
          <VStack spacing={4} justify="center" h="100%">
            <HStack spacing={3} align="center">
              <Spinner size="sm" color="myGray.500" emptyColor="gray.200" />
              <Text color="myGray.500" fontSize="14px">
                {t(evaluationStatusMap[EvaluationStatus.Evaluating])}
              </Text>
            </HStack>
          </VStack>
        );

      case EvaluationStatus.NeedsImprovement:
        return (
          <Box>
            <HStack spacing={2} mb={4}>
              <Badge colorScheme="orange" variant="subtle" px={2} py={1}>
                {t(evaluationStatusMap[EvaluationStatus.NeedsImprovement])}
              </Badge>
            </HStack>
            <Text fontSize="14px" lineHeight="1.6" color="gray.700">
              {currentEvaluationResult}
            </Text>
          </Box>
        );

      case EvaluationStatus.HighQuality:
        return (
          <Box>
            <HStack spacing={2} mb={4}>
              <Badge colorScheme="green" variant="subtle" px={2} py={1}>
                {t(evaluationStatusMap[EvaluationStatus.HighQuality])}
              </Badge>
            </HStack>
            <Text fontSize="14px" lineHeight="1.6" color="gray.700">
              {currentEvaluationResult}
            </Text>
          </Box>
        );

      case EvaluationStatus.Abnormal:
        return (
          <VStack spacing={4} justify="center" h="100%">
            <Box borderRadius="md">
              <Flex align="center" mb={4}>
                <MyIcon name="closeSolid" w={4} h={4} color="red" mr={1} />
                <Text fontSize="14px" fontWeight="medium" color="red.500">
                  {t('dashboard_evaluation:evaluation_abnormal')}
                </Text>
              </Flex>
              <Text fontSize="14px" color="myGray.600" mb={2}>
                {t('dashboard_evaluation:error_message')}:
              </Text>
              <Text fontSize="14px" color="myGray.900" lineHeight="1.5">
                {formData.metadata?.qualityError}
              </Text>
            </Box>
          </VStack>
        );

      case EvaluationStatus.NotEvaluated:
      default:
        return (
          <VStack spacing={4} justify="center" h="100%">
            <Box borderRadius="full" display="flex" alignItems="center" justifyContent="center">
              <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
            </Box>
            <Flex fontSize={'14px'} gap={1}>
              <Text color="gray.500">{t('dashboard_evaluation:no_evaluation_result_click')}</Text>
              <Text as="ins" color="gray.500" cursor={'pointer'}>
                {t('dashboard_evaluation:start_evaluation_action')}
              </Text>
            </Flex>
          </VStack>
        );
    }
  };

  const {
    isOpen: isOpenModifyModal,
    onOpen: onOpenModifyModal,
    onClose: onCloseModifyModal
  } = useDisclosure();

  const handleOpenModal = () => {
    onOpenModifyModal();
  };

  const handleCloseModal = () => {
    onCloseModifyModal();
  };

  const handleConfirm = (data: { result: EvaluationStatus; reason: string }) => {
    setCurrentEvaluationStatus(data.result);
    setCurrentEvaluationResult(data.reason);
    handleCloseModal();
  };

  const handleOprRes = async (key: OprResType) => {
    switch (key) {
      case 'startReview':
      case 'reStart':
        await simulateEvaluation({ dataId: formData._id });

        // 设置评测状态为进行中
        setCurrentEvaluationStatus(EvaluationStatus.Evaluating);

        // 更新按钮状态
        setReviewBtns((prev) =>
          prev.map((btn) => ({
            ...btn,
            isShow: false
          }))
        );

        // 根据结果更新按钮状态
        setReviewBtns((prev) =>
          prev.map((btn) => ({
            ...btn,
            isShow: btn.key === 'modifyRes' || btn.key === 'reStart'
          }))
        );
        break;

      case 'modifyRes':
        handleOpenModal();
        break;

      default:
        break;
    }
  };

  return (
    <>
      <MyModal
        maxW={['90vw', '90vw']}
        w={'1024px'}
        isOpen={isOpen}
        onClose={onClose}
        size={'md'}
        iconSrc="modal/edit"
        title={t('dashboard_evaluation:edit_data')}
      >
        <ModalBody w={'1024px'}>
          <Flex>
            {/* 左侧表单区域 */}
            <Box flex={1} mr={5}>
              <VStack spacing={6} align="stretch">
                <FormControl isRequired>
                  <FormLabel required mt={1.5} mb={3.5}>
                    {t('dashboard_evaluation:question')}
                  </FormLabel>
                  <Textarea
                    placeholder={t('dashboard_evaluation:enter_question')}
                    bg="gray.50"
                    minH="234px"
                    {...register('question', {
                      required: t('dashboard_evaluation:question_required')
                    })}
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel mt={1.5} mb={3.5} required>
                    {t('dashboard_evaluation:reference_answer')}
                  </FormLabel>
                  <Textarea
                    placeholder={t('dashboard_evaluation:enter_reference_answer')}
                    bg="gray.50"
                    minH="234px"
                    {...register('referenceAnswer', {
                      required: t('dashboard_evaluation:reference_answer_required')
                    })}
                  />
                </FormControl>
              </VStack>
            </Box>

            {/* 右侧评测结果区域 */}
            <VStack flex={1} alignItems={'flex-start'}>
              <Flex width={'100%'} alignItems={'center'} mb={2}>
                <Text fontSize={'14px'} color="myGray.900">
                  {t('dashboard_evaluation:quality_evaluation')}
                </Text>
                {/* 只有当不是评估中或排队中状态时才显示操作按钮 */}
                {currentEvaluationStatus !== EvaluationStatus.Evaluating &&
                  currentEvaluationStatus !== EvaluationStatus.Queuing && (
                    <HStack ml={'auto'}>
                      {reviewBtns
                        .filter((btn) => btn.isShow)
                        .map((btn, index) => (
                          <Button
                            key={btn.key}
                            fontSize={'12px'}
                            px={2.5}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault(); // 阻止默认行为
                              handleOprRes(btn.key);
                            }}
                            variant="outline"
                            isLoading={
                              isEvaluating && (btn.key === 'startReview' || btn.key === 'reStart')
                            }
                            disabled={isEvaluating}
                          >
                            {btn.label}
                          </Button>
                        ))}
                    </HStack>
                  )}
              </Flex>
              <Box bg="gray.50" borderRadius="md" p={4} flex={1} overflow="auto" width="100%">
                {renderEvaluationContent()}
              </Box>
            </VStack>
          </Flex>
        </ModalBody>
        <ModalFooter>
          {/* 底部操作按钮 */}
          <Flex justify="flex-end" p={6}>
            <HStack spacing={3}>
              <Button
                variant="outline"
                onClick={(e) => {
                  e.preventDefault(); // 阻止默认行为
                  onClose();
                }}
              >
                {t('dashboard_evaluation:cancel')}
              </Button>
              <Button
                colorScheme="blue"
                isLoading={isLoading}
                onClick={(e) => {
                  e.preventDefault(); // 阻止默认行为
                  handleSubmit((data) => handleSaveClick(data, false))(e);
                }}
              >
                {t('dashboard_evaluation:save')}
              </Button>
              <Button
                variant="outline"
                isLoading={isLoading}
                onClick={(e) => {
                  e.preventDefault(); // 阻止默认行为
                  handleSubmit((data) => handleSaveClick(data, true))(e);
                }}
              >
                {t('dashboard_evaluation:save_and_next')}
              </Button>
            </HStack>
          </Flex>
        </ModalFooter>
      </MyModal>
      <ModifyEvaluationModal
        isOpen={isOpenModifyModal}
        onClose={handleCloseModal}
        onConfirm={handleConfirm}
        defaultValues={{
          evaluationStatus: currentEvaluationStatus,
          evaluationResult: currentEvaluationResult
        }}
      />
    </>
  );
};

export default React.memo(EditDataModal);
