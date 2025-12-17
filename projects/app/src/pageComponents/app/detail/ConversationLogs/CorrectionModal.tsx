import React, { useCallback, useState } from 'react';
import {
  Box,
  Button,
  VStack,
  ModalFooter,
  Text,
  SimpleGrid,
  RadioGroup as ChakraRadioGroup,
  Radio,
  HStack
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import type { SubmitChatCorrectionParams } from './type';
import { CorrectionModeEnum } from './type';
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
  modelName: string;
  defaultQuestion?: string;
  defaultAnswer?: string;
  onSubmit: (params: SubmitChatCorrectionParams) => Promise<void>;
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
  modelName,
  defaultQuestion = '',
  defaultAnswer = '',
  onSubmit
}: CorrectionModalProps) => {
  const { t } = useTranslation();
  const [question, setQuestion] = useState(defaultQuestion);
  const [correctionMode, setCorrectionMode] = useState<CorrectionModeEnum>(CorrectionModeEnum.edit);
  const [correctedAnswer, setCorrectedAnswer] = useState(defaultAnswer);
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 处理取消
  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  // 处理确认提交
  const handleConfirm = useCallback(async () => {
    if (!question.trim()) {
      return;
    }

    if (correctionMode === CorrectionModeEnum.edit && !correctedAnswer.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const params: SubmitChatCorrectionParams = {
        appId,
        chatId,
        dataId,
        modelName,
        correctionData: {
          correctionMode,
          question: question.trim(),
          rawAnswer: defaultAnswer,
          ...(correctionMode === CorrectionModeEnum.edit
            ? { correctedAnswer: correctedAnswer.trim() }
            : { correctedQuoteList: [] })
        }
      };

      await onSubmit(params);
      onClose();
    } catch (error) {
      console.error('提交纠错失败:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    question,
    correctionMode,
    correctedAnswer,
    appId,
    chatId,
    dataId,
    modelName,
    defaultAnswer,
    onSubmit,
    onClose
  ]);

  // 判断是否可以提交
  const canSubmit =
    question.trim() !== '' &&
    (correctionMode === CorrectionModeEnum.annotate
      ? selectedKnowledgeIds.length > 0
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
    >
      <VStack spacing={4} align="stretch" px={6} py={4}>
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
              selectedKnowledgeIds={selectedKnowledgeIds}
              onKnowledgeSelect={setSelectedKnowledgeIds}
            />
          </Box>
        )}
      </VStack>

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
