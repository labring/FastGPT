import { Box, Button, Flex, ModalBody, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import type { EnhancedErrorMessage } from '@fastgpt/global/core/train/rerank/error';

const TrainExceptionModal = ({
  error,
  onClose,
  onRetry
}: {
  error: { taskId: string; errorMsg: EnhancedErrorMessage } | null;
  onClose: () => void;
  onRetry?: () => void;
}) => {
  const { t } = useTranslation();

  const displayContent = error
    ? (() => {
        const { type, message, suggestion } = error.errorMsg;

        // 所有字段都已经是 i18n key 格式，直接翻译
        // message: 'train:xxx'
        // suggestion: 'train:xxx_suggestion' or undefined
        const translatedMessage = t(message || `train:${type}`);
        const translatedSuggestion = suggestion ? t(suggestion) : '';

        // 构建显示内容（originalError 不显示给用户）
        const parts = [translatedMessage, translatedSuggestion].filter(Boolean);

        return parts.join('\n');
      })()
    : t('app:unknown_error');

  return (
    <MyModal
      isOpen={!!error} // 当 error 存在时显示
      onClose={onClose}
      iconSrc="common/info"
      iconColor={'primary.600'}
      title={t('app:exception_info')}
      minW={['90vw', '600px']}
    >
      <ModalBody px={9} minH={['200px']} display="flex" alignItems="center" justifyContent="center">
        <Box
          p={'24px 32px'}
          borderRadius={'8px'}
          bg={'#FEF3F2'}
          fontSize={'sm'}
          color={'myGray.600'}
          whiteSpace={'pre-wrap'} // 保留换行符
          wordBreak={'break-word'}
          minW={'506px'}
        >
          {displayContent}
        </Box>
      </ModalBody>
      <ModalFooter px={9}>
        <Flex justifyContent={'flex-end'} gap={4}>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Close')}
          </Button>
          <Button variant={'primary'} onClick={onRetry}>
            {t('app:retry')}
          </Button>
        </Flex>
      </ModalFooter>
    </MyModal>
  );
};

export default TrainExceptionModal;
