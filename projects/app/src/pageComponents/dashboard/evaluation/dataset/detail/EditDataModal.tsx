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
  EvalDatasetDataQualityStatusEnum,
  EvalDatasetDataQualityResultEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import {
  postEvaluationDatasetQualityAssessment,
  getEvaluationDatasetDataDetail
} from '@/web/core/evaluation/dataset';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import type { listEvalDatasetDataResponse } from '@fastgpt/global/core/evaluation/dataset/api';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { updateEvaluationDatasetData } from '@/web/core/evaluation/dataset';

interface EditDataFormData {
  question: string;
  referenceAnswer: string;
}

interface EditDataModalProps {
  isOpen: boolean;
  onClose: (isRefresh: boolean) => void;
  onSave: (
    data: EditDataFormData & { qualityMetadata: any; qualityResult: string },
    isGoNext?: boolean
  ) => void;
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
    () => formData?.qualityMetadata?.status || EvalDatasetDataQualityStatusEnum.unevaluated,
    [formData]
  );
  const qualityReason = useMemo(() => formData?.qualityMetadata?.reason || '', [formData]);
  const defaultQuestion = useMemo(() => formData?.userInput || '', [formData]);
  const defaultReferenceAnswer = useMemo(() => formData?.expectedOutput || '', [formData]);

  const { t } = useTranslation();
  const [currentEvaluationStatus, setCurrentEvaluationStatus] = useState<string>(
    formData?.qualityMetadata?.status || EvalDatasetDataQualityStatusEnum.unevaluated
  );
  const [currentQualityReason, setCurrentQualityReason] = useState<string>(
    formData?.qualityMetadata?.reason
  );
  const [currentQualityResult, setCurrentQualityResult] = useState<string>(
    formData?.qualityResult || ''
  );

  const hasStatusChange = useMemo(
    () => currentQualityReason !== qualityReason || evaluationStatus !== currentEvaluationStatus,
    [currentQualityReason, currentEvaluationStatus]
  );

  const [errorMsg, setErrorMsg] = useState(formData.qualityMetadata?.error || '');

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
  const updateButtonsByStatus = (status: string, qualityResult?: string) => {
    setReviewBtns((prev) =>
      prev.map((btn) => {
        switch (btn.key) {
          case 'startReview':
            // 开始测评：只有状态为未测评时才显示
            return { ...btn, isShow: status === EvalDatasetDataQualityStatusEnum.unevaluated };

          case 'reStart':
            // 重新测评：异常、已完成(有质量结果)才显示
            return {
              ...btn,
              isShow: Boolean(
                status === EvalDatasetDataQualityStatusEnum.error ||
                  (status === EvalDatasetDataQualityStatusEnum.completed && qualityResult)
              )
            };

          case 'modifyRes':
            // 修改结果：已完成且有质量结果时才显示
            return {
              ...btn,
              isShow: Boolean(
                status === EvalDatasetDataQualityStatusEnum.completed && !!qualityResult
              )
            };

          default:
            // 评测中、排队中不显示任何按钮
            return { ...btn, isShow: false };
        }
      })
    );
  };

  const { runAsync: simulateEvaluation, loading: isEvaluating } = useRequest2(
    postEvaluationDatasetQualityAssessment,
    {
      onError() {
        setCurrentEvaluationStatus(formData?.qualityMetadata?.status);
        setCurrentQualityReason(formData?.qualityMetadata?.reason);
        setCurrentQualityResult(formData?.qualityResult || '');
      }
    }
  );

  // 新增保存请求，用于重测前的数据保存
  const { runAsync: saveBeforeRetest, loading: isSavingBeforeRetest } = useRequest2(
    async (data: EditDataFormData) =>
      updateEvaluationDatasetData({
        dataId: formData._id,
        userInput: data.question,
        expectedOutput: data.referenceAnswer
      }),
    {
      errorToast: t('common:submit_failed')
    }
  );

  // 重测按钮的loading状态
  const retestLoading = useMemo(() => {
    return isEvaluating || isSavingBeforeRetest;
  }, [isEvaluating, isSavingBeforeRetest]);

  // 轮询获取数据详情 - 在评测中或排队中时才轮询
  const { runAsync: getDetail } = useRequest2(() => getEvaluationDatasetDataDetail(formData._id), {
    pollingInterval: 3000,
    pollingWhenHidden: false,
    manual: true,
    ready: isOpen,
    onSuccess: (data: any) => {
      if (data?.qualityMetadata?.status !== currentEvaluationStatus) {
        const newStatus =
          data?.qualityMetadata?.status || EvalDatasetDataQualityStatusEnum.unevaluated;
        const newQualityResult = data?.qualityResult || '';
        setCurrentEvaluationStatus(newStatus);
        setCurrentQualityReason(data?.qualityMetadata?.reason || '');
        setCurrentQualityResult(newQualityResult);
        updateButtonsByStatus(newStatus, newQualityResult);
        newStatus === EvalDatasetDataQualityStatusEnum.error &&
          setErrorMsg(data?.qualityMetadata?.error);
      }
    }
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
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
      setCurrentQualityReason(qualityReason);
      setCurrentQualityResult(formData?.qualityResult || '');

      // 根据评测状态设置按钮显示状态
      updateButtonsByStatus(evaluationStatus, formData?.qualityResult);

      if (
        currentEvaluationStatus === EvalDatasetDataQualityStatusEnum.evaluating ||
        currentEvaluationStatus === EvalDatasetDataQualityStatusEnum.queuing
      ) {
        getDetail();
      }
    }
  }, [isOpen, defaultQuestion, defaultReferenceAnswer, evaluationStatus, qualityReason]);

  const handleSaveClick = (data: EditDataFormData, isGoNext = false) => {
    // 检查是否修改了问题或参考答案
    const hasQuestionChanged = data.question !== defaultQuestion;
    const hasAnswerChanged = data.referenceAnswer !== defaultReferenceAnswer;

    let saveData;
    if (hasQuestionChanged || hasAnswerChanged) {
      // 如果修改了问题或答案，重置评测状态
      saveData = {
        ...data,
        qualityMetadata: {
          status: EvalDatasetDataQualityStatusEnum.unevaluated,
          reason: ''
        },
        qualityResult: ''
      };
    } else {
      // 如果没有修改问题或答案，保持当前评测状态
      saveData = {
        ...data,
        qualityMetadata: {
          status: currentEvaluationStatus,
          reason: currentQualityReason
        },
        qualityResult: currentQualityResult
      };
    }

    onSave(saveData, isGoNext);
  };

  const renderEvaluationContent = () => {
    switch (currentEvaluationStatus) {
      case EvalDatasetDataQualityStatusEnum.queuing:
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

      case EvalDatasetDataQualityStatusEnum.evaluating:
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

      case EvalDatasetDataQualityStatusEnum.completed:
        // 已完成的情况下，根据 qualityResult 显示结果
        if (currentQualityResult === EvalDatasetDataQualityResultEnum.needsOptimization) {
          return (
            <Box>
              <HStack spacing={2} mb={4}>
                <MyTag colorSchema="yellow" type={'fill'} fontWeight={500}>
                  {t(evaluationStatusMap[EvaluationStatus.NeedsImprovement])}
                </MyTag>
              </HStack>
              <Text fontSize="14px" lineHeight="1.6" color="gray.700">
                {currentQualityReason}
              </Text>
            </Box>
          );
        } else if (currentQualityResult === EvalDatasetDataQualityResultEnum.highQuality) {
          return (
            <Box>
              <HStack spacing={2} mb={4}>
                <MyTag colorSchema="green" type={'fill'} fontWeight={500}>
                  {t(evaluationStatusMap[EvaluationStatus.HighQuality])}
                </MyTag>
              </HStack>
              <Text fontSize="14px" lineHeight="1.6" color="gray.700">
                {currentQualityReason}
              </Text>
            </Box>
          );
        } else {
          // 没有质量结果的已完成状态
          return (
            <Box>
              <Text fontSize="14px" color="gray.600">
                {t('dashboard_evaluation:evaluation_completed_no_result') ||
                  'Evaluation completed without result'}
              </Text>
            </Box>
          );
        }

      case EvalDatasetDataQualityStatusEnum.error:
        return (
          <VStack spacing={4} justify="center" h="100%">
            <Box borderRadius="md">
              <Flex align="center" mb={4}>
                <MyIcon name="closeSolid" w={4} h={4} color="red" mr={1} />
                <Text fontSize="14px" fontWeight="medium" color="red.500">
                  {t('dashboard_evaluation:evaluation_abnormal')}
                </Text>
              </Flex>
              {errorMsg && (
                <>
                  <Text fontSize="14px" color="myGray.600" mb={2}>
                    {t('dashboard_evaluation:error_message')}:
                  </Text>
                  <Text fontSize="14px" color="myGray.900" lineHeight="1.5">
                    {errorMsg}
                  </Text>
                </>
              )}
            </Box>
          </VStack>
        );

      case EvalDatasetDataQualityStatusEnum.unevaluated:
      default:
        return (
          <VStack spacing={4} justify="center" h="100%">
            <Box borderRadius="full" display="flex" alignItems="center" justifyContent="center">
              <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
            </Box>
            <Flex fontSize={'14px'}>
              <Text color="gray.500">{t('dashboard_evaluation:no_evaluation_result_click')}</Text>
              <Text
                as="ins"
                color="gray.500"
                cursor={'pointer'}
                onClick={() => handleOprRes('startReview')}
              >
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
    // 将前端的 EvaluationStatus 转换为对应的状态和结果
    if (
      data.result === EvaluationStatus.HighQuality ||
      data.result === EvaluationStatus.NeedsImprovement
    ) {
      setCurrentEvaluationStatus(EvalDatasetDataQualityStatusEnum.completed);
      setCurrentQualityResult(data.result);
    } else {
      setCurrentEvaluationStatus(data.result);
      setCurrentQualityResult('');
    }
    setCurrentQualityReason(data.reason);
    handleCloseModal();
  };

  const handleReview = async () => {
    // 发起重测请求
    await simulateEvaluation({ dataId: formData._id });

    // 设置评测状态为进行中
    setCurrentEvaluationStatus(EvalDatasetDataQualityStatusEnum.evaluating);

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
    getDetail();
  };

  const handleOprRes = async (key: OprResType) => {
    switch (key) {
      case 'startReview':
        handleReview();
        break;

      case 'reStart':
        // 获取当前表单数据
        const currentFormData = getValues();

        // 检查数据是否发生变化
        const hasDataChanged =
          currentFormData.question !== defaultQuestion ||
          currentFormData.referenceAnswer !== defaultReferenceAnswer;

        if (hasDataChanged) {
          // 如果数据发生变化，先保存再重测
          await saveBeforeRetest(currentFormData);
        }
        handleReview();

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
        onClose={() => onClose(hasStatusChange)}
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
                    maxLength={1000}
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
                    maxLength={1000}
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
              <Flex width={'100%'} alignItems={'center'}>
                <Text fontSize={'14px'} color="myGray.900">
                  {t('dashboard_evaluation:quality_evaluation')}
                </Text>
                {/* 只有当不是评估中或排队中状态时才显示操作按钮 */}
                {currentEvaluationStatus !== EvalDatasetDataQualityStatusEnum.evaluating &&
                  currentEvaluationStatus !== EvalDatasetDataQualityStatusEnum.queuing && (
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
                              retestLoading && (btn.key === 'startReview' || btn.key === 'reStart')
                            }
                            disabled={retestLoading}
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
                  onClose(hasStatusChange);
                }}
              >
                {t('dashboard_evaluation:cancel')}
              </Button>
              <Button
                isLoading={isLoading}
                variant="outline"
                onClick={(e) => {
                  e.preventDefault(); // 阻止默认行为
                  handleSubmit((data) => handleSaveClick(data, false))(e);
                }}
              >
                {t('dashboard_evaluation:save')}
              </Button>
              <Button
                colorScheme="blue"
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
          evaluationStatus:
            currentQualityResult === EvalDatasetDataQualityResultEnum.highQuality
              ? EvaluationStatus.HighQuality
              : EvaluationStatus.NeedsImprovement,
          evaluationResult: currentQualityReason
        }}
      />
    </>
  );
};

export default React.memo(EditDataModal);
