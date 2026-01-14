import {
  Box,
  Button,
  Flex,
  ModalBody,
  ModalFooter,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { getTrainingError, updateTrainingData } from '@/web/core/dataset/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

const ExceptionInfoModal = ({
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
    pageSize: 15,
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

  const { runAsync: updateData, loading: updateLoading } = useRequest2(
    (data: { datasetId: string; collectionId: string; dataId: string }) => {
      return updateTrainingData(data);
    },
    {
      manual: true,
      onSuccess: () => {
        refreshList();
      }
    }
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="common/info"
      iconColor={'primary.600'}
      title={t('dataset:exception_info')}
      minW={['90vw', '712px']}
    >
      <ModalBody px={9} minH={['90vh', '400px']}>
        <ScrollData h={'400px'} isLoading={isLoading || updateLoading}>
          <TableContainer overflowY={'auto'} fontSize={'12px'}>
            <Table variant={'simple'}>
              <Thead>
                <Tr>
                  <Th pr={0}>{t('dataset:dataset.Chunk_Number')}</Th>
                  <Th>{t('dataset:dataset.Error_Message')}</Th>
                  <Th w={'120px'}>{t('dataset:dataset.Operation')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {errorList.map((item, index) => (
                  <Tr key={index}>
                    <Td>{item.chunkIndex + 1}</Td>
                    <Td maxW={50}>
                      <MyTooltip
                        shouldWrapChildren={false}
                        placement={'auto'}
                        label={t(item.errorMsg)}
                      >
                        {t(item.errorMsg)}
                      </MyTooltip>
                    </Td>
                    <Td w={'120px'} px={3}>
                      <Button
                        variant={'ghost'}
                        size={'sm'}
                        color={'myGray.600'}
                        leftIcon={<MyIcon name={'common/confirm/restoreTip'} w={4} />}
                        fontSize={'mini'}
                        onClick={() => updateData({ datasetId, collectionId, dataId: item._id })}
                      >
                        {t('dataset:dataset.ReTrain')}
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </ScrollData>
      </ModalBody>
      <ModalFooter px={9}>
        <Flex justifyContent={'flex-end'} gap={4}>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Close')}
          </Button>
          <Button
            variant={'primary'}
            isLoading={retrying}
            onClick={handleRetryAll}
            isDisabled={errorList.length === 0}
          >
            {t('dataset:retry_all')}
          </Button>
        </Flex>
      </ModalFooter>
    </MyModal>
  );
};

export default ExceptionInfoModal;
