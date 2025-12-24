import React, { useCallback, useState, useEffect } from 'react';
import {
  Box,
  Button,
  VStack,
  ModalBody,
  ModalFooter,
  Text,
  SimpleGrid,
  RadioGroup as ChakraRadioGroup,
  Radio,
  HStack
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import type { SubmitChatCorrectionParams } from '@fastgpt/global/core/chat/correction/api';
import type {
  SubmitChatCorrectionResponse,
  ListChatCorrectionParams
} from '@fastgpt/global/core/chat/correction/api';
import type {
  CorrectedQuoteItem,
  CorrectionDataType
} from '@fastgpt/global/core/chat/correction/type';
import { CorrectionModeEnum } from '@fastgpt/global/core/chat/correction/constants';
import {
  getAppDatasetCollection,
  submitChatCorrection,
  getChatCorrectionList
} from '@/web/core/app/api/log';
import KnowledgeSelect from './KnowledgeSelect';

/**
 * 回答纠错弹窗组件属性接口
 */
interface CorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  appId: string;
  chatId: string;
  dataId: string;
  defaultCorrectionData?: Partial<CorrectionDataType>;
  onSubmit: (response: SubmitChatCorrectionResponse) => Promise<void>;
  correctionId?: string;
}

/**
 * 回答纠错弹窗组件
 * 用于用户对对话进行纠错，支持编辑答案和标注答案引用的知识两种模式
 */
const CorrectionModal = ({
  isOpen,
  onClose,
  appId,
  chatId,
  dataId,
  defaultCorrectionData,
  onSubmit,
  correctionId
}: CorrectionModalProps) => {
  const { t } = useTranslation();

  // 从 defaultCorrectionData 中提取初始值，提供默认值
  const initialQuestion = defaultCorrectionData?.question ?? '';
  const initialRawAnswer = defaultCorrectionData?.rawAnswer ?? '';
  const initialCorrectedAnswer = defaultCorrectionData?.correctedAnswer ?? initialRawAnswer;
  const initialCorrectionMode = defaultCorrectionData?.correctionMode ?? CorrectionModeEnum.edit;

  const [question, setQuestion] = useState(initialQuestion);
  const [correctionMode, setCorrectionMode] = useState<CorrectionModeEnum>(initialCorrectionMode);
  const [correctedAnswer, setCorrectedAnswer] = useState(initialCorrectedAnswer);
  const [correctedQuoteList, setCorrectedQuoteList] = useState<CorrectedQuoteItem[]>(
    defaultCorrectionData?.correctedQuoteList ?? []
  );
  const [datasetIds, setDatasetIds] = useState<string[]>([]);
  const [currentCorrectionData, setCurrentCorrectionData] = useState<Partial<CorrectionDataType>>(
    defaultCorrectionData ?? {}
  );
  const [isInitializing, setIsInitializing] = useState(false);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [correctionDataLoading, setCorrectionDataLoading] = useState(false);

  // 使用 useRequest2 获取应用数据集集合
  const { runAsync: fetchAppDatasets } = useRequest2(
    async (appId: string) => {
      const response = await getAppDatasetCollection({ appId });
      const ids = response.datasets.map((dataset) => dataset.datasetId);
      setDatasetIds(ids);
      return response;
    },
    {
      manual: true,
      errorToast: t('app:fetch_app_datasets_error')
    }
  );

  // 使用 useRequest2 获取已存在的纠错数据
  const { runAsync: fetchCorrectionData } = useRequest2(
    async (correctionId: string) => {
      const params: ListChatCorrectionParams = {
        appId,
        chatId,
        dataId,
        correctionId,
        pageSize: 1,
        pageNum: 1
      };
      const response = await getChatCorrectionList(params);
      if (response.list.length > 0) {
        const correctionItem = response.list[0];
        setCurrentCorrectionData(correctionItem.correctionData);
        // 更新表单状态
        setQuestion(correctionItem.correctionData.question);
        setCorrectionMode(correctionItem.correctionData.correctionMode);
        if (correctionItem.correctionData.correctedAnswer) {
          setCorrectedAnswer(correctionItem.correctionData.correctedAnswer);
        }
        if (correctionItem.correctionData.correctedQuoteList) {
          setCorrectedQuoteList(correctionItem.correctionData.correctedQuoteList);
        }
      }
      return response;
    },
    {
      manual: true,
      errorToast: t('app:fetch_correction_data_failed')
    }
  );

  // 当弹窗打开时获取数据集
  useEffect(() => {
    if (isOpen && appId) {
      setDatasetsLoading(true);
      fetchAppDatasets(appId)
        .catch(() => {
          setDatasetIds([]);
        })
        .finally(() => {
          setDatasetsLoading(false);
        });
    }
  }, [isOpen, appId, fetchAppDatasets]);

  // 当弹窗打开且 correctionId 存在时，获取纠错数据
  useEffect(() => {
    if (isOpen && correctionId && appId && chatId && dataId) {
      setCorrectionDataLoading(true);
      fetchCorrectionData(correctionId)
        .catch(() => {
          // 如果获取失败，使用默认数据
          setCurrentCorrectionData(defaultCorrectionData ?? {});
        })
        .finally(() => {
          setCorrectionDataLoading(false);
        });
    }
  }, [isOpen, correctionId, appId, chatId, dataId, fetchCorrectionData, defaultCorrectionData]);

  // 综合管理初始化状态
  useEffect(() => {
    if (isOpen) {
      setIsInitializing(datasetsLoading || correctionDataLoading);
    } else {
      // 弹窗关闭时重置所有状态
      setIsInitializing(false);
      setDatasetsLoading(false);
      setCorrectionDataLoading(false);
    }
  }, [isOpen, datasetsLoading, correctionDataLoading]);

  // 处理取消
  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  // 使用 useRequest2 处理提交纠错
  const { runAsync: submitCorrection, loading: isSubmitting } = useRequest2(
    async () => {
      if (!question.trim()) {
        return;
      }

      if (correctionMode === CorrectionModeEnum.edit && !correctedAnswer.trim()) {
        return;
      }

      const params: SubmitChatCorrectionParams = {
        appId,
        chatId,
        dataId,
        correctionData: {
          correctionMode,
          question: question.trim(),
          rawAnswer: initialRawAnswer,
          ...(correctionMode === CorrectionModeEnum.edit
            ? { correctedAnswer: correctedAnswer.trim() }
            : {
                correctedQuoteList: correctedQuoteList
              })
        }
      };

      // 调用 submitChatCorrection 接口
      const response = await submitChatCorrection(params);

      // 接口成功后，调用外部传入的回调，传入响应结果
      await onSubmit(response);
    },
    {
      manual: true,
      errorToast: t('app:submit_correction_failed'),
      successToast: t('app:submit_correction_success')
    }
  );

  // 处理确认提交
  const handleConfirm = useCallback(async () => {
    await submitCorrection();
  }, [submitCorrection]);

  // 判断是否可以提交
  const canSubmit =
    question.trim() !== '' &&
    (correctionMode === CorrectionModeEnum.annotate
      ? correctedQuoteList.length > 0
      : correctedAnswer.trim() !== '');

  return (
    <MyModal
      isOpen={isOpen}
      onClose={onClose}
      iconSrc="edit"
      iconColor={'primary.600'}
      title={t('app:Correction_Modal_Title')}
      maxW="800px"
      w="90vw"
      closeOnOverlayClick={false}
      isLoading={isInitializing}
    >
      <ModalBody>
        <VStack spacing={4} align="stretch">
          {/* 问题输入框 */}
          <Box>
            <FormLabel mb={2} color={'myGray.900'} fontSize={'14px'} fontWeight={'medium'} required>
              {t('app:Correction_Question_Label')}
            </FormLabel>
            <MyTextarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} />
          </Box>

          {/* 答案类型选择 */}
          <Box>
            <FormLabel mb={3} color={'myGray.900'} fontSize={'14px'} fontWeight={'medium'} required>
              {t('app:Correction_Answer_Label')}
            </FormLabel>
            <ChakraRadioGroup
              value={correctionMode}
              onChange={(value) => setCorrectionMode(value as CorrectionModeEnum)}
            >
              <SimpleGrid columns={2} spacing={4}>
                <Box
                  border="1px solid"
                  borderColor={
                    correctionMode === CorrectionModeEnum.edit ? 'primary.600' : 'myGray.200'
                  }
                  borderRadius="md"
                  px={3}
                  py={2.5}
                  cursor="pointer"
                  onClick={() => setCorrectionMode(CorrectionModeEnum.edit)}
                  transition="all 0.2s"
                  bg={correctionMode === CorrectionModeEnum.edit ? 'primary.50' : 'transparent'}
                  _hover={{ borderColor: 'primary.300' }}
                >
                  <VStack align="stretch" spacing={2}>
                    <HStack align="center" spacing={2}>
                      <Radio value={CorrectionModeEnum.edit} />
                      <Text fontWeight="medium" fontSize="14px" color="myGray.900">
                        {t('app:Correction_Edit_Answer')}
                      </Text>
                    </HStack>
                    <Text fontSize="12px" color="myGray.500">
                      {t('app:Correction_Edit_Answer_Desc')}
                    </Text>
                  </VStack>
                </Box>

                <Box
                  border="1px solid"
                  borderColor={
                    correctionMode === CorrectionModeEnum.annotate ? 'primary.600' : 'myGray.200'
                  }
                  borderRadius="md"
                  px={3}
                  py={2.5}
                  cursor="pointer"
                  onClick={() => setCorrectionMode(CorrectionModeEnum.annotate)}
                  transition="all 0.2s"
                  bg={correctionMode === CorrectionModeEnum.annotate ? 'primary.50' : 'transparent'}
                  _hover={{ borderColor: 'primary.300' }}
                >
                  <VStack align="stretch" spacing={2}>
                    <HStack align="center" spacing={2}>
                      <Radio value={CorrectionModeEnum.annotate} />
                      <Text fontWeight="medium" fontSize="14px" color="myGray.900">
                        {t('app:Correction_Annotate_Knowledge')}
                      </Text>
                    </HStack>
                    <Text fontSize="12px" color="myGray.500">
                      {t('app:Correction_Annotate_Knowledge_Desc')}
                    </Text>
                  </VStack>
                </Box>
              </SimpleGrid>
            </ChakraRadioGroup>
          </Box>

          {/* 根据选择的模式显示对应的输入框 */}
          {correctionMode === CorrectionModeEnum.edit && (
            <Box>
              <MyTextarea
                value={correctedAnswer}
                onChange={(e) => setCorrectedAnswer(e.target.value)}
                rows={15}
              />
            </Box>
          )}

          {correctionMode === CorrectionModeEnum.annotate && (
            <Box>
              <KnowledgeSelect
                correctedQuoteList={correctedQuoteList}
                onCorrectedQuoteListChange={setCorrectedQuoteList}
                appId={appId}
                chatId={chatId}
                datasetIds={datasetIds}
              />
            </Box>
          )}
        </VStack>
      </ModalBody>

      {/* 底部按钮 */}
      <ModalFooter>
        <Button variant="whiteBase" mr={3} onClick={handleCancel}>
          {t('common:Cancel')}
        </Button>
        <Button isDisabled={!canSubmit} isLoading={isSubmitting} onClick={handleConfirm}>
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(CorrectionModal);
