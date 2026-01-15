import { Box, Button, Flex, ModalBody, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getTrainingError, updateTrainingData } from '@/web/core/dataset/api';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

const DatabaseExceptionModal = ({
  datasetId,
  collectionId,
  onClose,
  onSuccess
}: {
  datasetId: string;
  collectionId: string;
  onClose: () => void;
  onSuccess?: () => void;
}) => {
  const { t } = useTranslation();

  const {
    data: errorList,
    ScrollData,
    isLoading,
    refreshList
  } = useScrollPagination(getTrainingError, {
    pageSize: 100,
    params: {
      collectionId
    },
    EmptyTip: <EmptyTip />
  });

  const { runAsync: handleRetryAll, loading: retrying } = useRequest2(
    () => updateTrainingData({ datasetId, collectionId }),
    {
      manual: true,
      onSuccess: () => {
        refreshList();
        onSuccess?.();
        onClose();
      },
      errorToast: t('dataset:retry_failed')
    }
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="common/info"
      iconColor={'primary.600'}
      title={t('dataset:exception_info')}
      minW={['90vw', '600px']}
    >
      <ModalBody
        px={9}
        minH={['90vh', '400px']}
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <ScrollData h={'400px'} isLoading={isLoading}>
          {errorList.length > 0 ? (
            <Box
              p={'24px 32px'}
              borderRadius={'8px'}
              bg={'#FEF3F2'}
              fontSize={'sm'}
              color={'myGray.600'}
              whiteSpace={'pre-wrap'}
              wordBreak={'break-word'}
              minW={'506px'}
            >
              {errorList.map((item, index) => (
                <Box key={index} mb={index < errorList.length - 1 ? 2 : 0}>
                  {t(item.errorMsg)}
                </Box>
              ))}
            </Box>
          ) : (
            <EmptyTip />
          )}
        </ScrollData>
      </ModalBody>
      <ModalFooter px={9}>
        <Flex justifyContent={'flex-end'} gap={4}>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('dataset:close')}
          </Button>
          <Button
            variant={'primary'}
            isLoading={retrying}
            onClick={handleRetryAll}
            isDisabled={errorList.length === 0}
          >
            {t('dataset:retry')}
          </Button>
        </Flex>
      </ModalFooter>
    </MyModal>
  );
};

export default DatabaseExceptionModal;
