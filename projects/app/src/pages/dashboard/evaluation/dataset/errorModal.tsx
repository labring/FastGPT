import React, { useEffect, useMemo } from 'react';
import {
  Box,
  Button,
  Flex,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Text,
  ModalBody,
  ModalFooter
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import {
  getEvaluationDatasetFailedTasks,
  postRetryEvaluationDatasetTask,
  deleteEvaluationDatasetTask,
  postRetryAllEvaluationDatasetTasks
} from '@/web/core/evaluation/dataset';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyBox from '@fastgpt/web/components/common/MyBox';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: (isUpdateList: boolean) => void;
  collectionId: string;
}

const ErrorModal = ({ isOpen, onClose, collectionId }: ErrorModalProps) => {
  const { t } = useTranslation();
  const [initialErrorListLength, setInitialErrorListLength] = React.useState<number | undefined>(
    undefined
  );

  // 获取失败任务列表
  const {
    data: errorList,
    loading: isLoading,
    runAsync: fetchFailedTasks,
    mutate: setErrorList
  } = useRequest2(() => getEvaluationDatasetFailedTasks({ collectionId }), {
    manual: true
  });

  // 当弹窗打开时发起请求，关闭时清空数据
  useEffect(() => {
    if (isOpen && collectionId) {
      fetchFailedTasks();
    } else if (!isOpen) {
      // 弹窗关闭时清空数据
      setErrorList(undefined);
      setInitialErrorListLength(undefined);
    }
  }, [isOpen, collectionId, fetchFailedTasks, setErrorList]);

  // 记录初始错误列表长度
  useEffect(() => {
    if (isOpen && errorList && initialErrorListLength === undefined) {
      setInitialErrorListLength(errorList.tasks?.length || 0);
    }
  }, [isOpen, errorList, initialErrorListLength]);

  const handleCloseErrorModal = () => {
    const currentErrorListLength = errorList?.tasks?.length || 0;
    const hasChanged =
      initialErrorListLength !== undefined && initialErrorListLength !== currentErrorListLength;
    onClose(hasChanged);
  };

  // 重试单个任务
  const { runAsync: onRetryTask, loading: retryLoading } = useRequest2(
    postRetryEvaluationDatasetTask,
    {
      successToast: t('dashboard_evaluation:retry_success'),
      onSuccess: () => {
        fetchFailedTasks();
      }
    }
  );

  // 删除单个任务
  const { runAsync: onDeleteTask, loading: deleteLoading } = useRequest2(
    deleteEvaluationDatasetTask,
    {
      successToast: t('dashboard_evaluation:delete_success'),
      onSuccess: () => {
        fetchFailedTasks();
      }
    }
  );

  // 批量重试所有任务
  const { runAsync: onRetryAll, loading: retryAllLoading } = useRequest2(
    () => postRetryAllEvaluationDatasetTasks({ collectionId }),
    {
      successToast: t('dashboard_evaluation:retry_success'),
      onSuccess: () => {
        fetchFailedTasks();
      }
    }
  );

  const isTableLoading = useMemo(
    () => isLoading || retryAllLoading || deleteLoading || retryLoading,
    [isLoading, retryAllLoading, deleteLoading, retryLoading]
  );

  const renderContent = () => {
    const isEmptyTip = !errorList?.tasks || errorList?.tasks?.length === 0;

    return (
      <MyBox h={'400px'} overflowY={'auto'} isLoading={isTableLoading}>
        <TableContainer fontSize={'12px'}>
          <Table variant="simple">
            <Thead>
              <Tr>
                <Th>{t('dashboard_evaluation:source_knowledge_base')}</Th>
                <Th w={'90px'}>{t('dashboard_evaluation:source_chunk')}</Th>
                <Th w={'50px'}>{t('dashboard_evaluation:error_message')}</Th>
                <Th w={'110px'}>{t('dashboard_evaluation:operations')}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {errorList?.tasks.map((error, index) => (
                <Tr key={index}>
                  <Td maxW={120}>
                    <MyTooltip
                      shouldWrapChildren={false}
                      placement={'auto'}
                      label={t(error.datasetName)}
                    >
                      {t(error.datasetName)}
                    </MyTooltip>
                  </Td>
                  <Td maxW={'90px'}>
                    <MyTooltip
                      shouldWrapChildren={false}
                      placement={'auto'}
                      label={t(error.dataId)}
                    >
                      {t(error.dataId)}
                    </MyTooltip>
                  </Td>
                  <Td maxW={'50px'}>
                    <MyTooltip
                      shouldWrapChildren={false}
                      placement={'auto'}
                      label={t(error.errorMessage)}
                    >
                      {t(error.errorMessage)}
                    </MyTooltip>
                  </Td>
                  <Td w={'110px'}>
                    <Flex alignItems={'center'}>
                      <Button
                        variant={'ghost'}
                        size={'sm'}
                        color={'myGray.600'}
                        leftIcon={<MyIcon name={'common/confirm/restoreTip'} w={4} />}
                        fontSize={'mini'}
                        onClick={() =>
                          onRetryTask({
                            jobId: error.jobId,
                            collectionId
                          })
                        }
                      >
                        {t('dashboard_evaluation:retry')}
                      </Button>
                      <Box w={'1px'} height={'16px'} bg={'myGray.200'} />
                      <Button
                        variant={'ghost'}
                        size={'sm'}
                        color={'myGray.600'}
                        leftIcon={<MyIcon name={'delete'} w={4} />}
                        fontSize={'mini'}
                        onClick={() =>
                          onDeleteTask({
                            jobId: error.jobId,
                            collectionId
                          })
                        }
                      >
                        {t('dashboard_evaluation:delete')}
                      </Button>
                    </Flex>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {isEmptyTip && <EmptyTip />}
        </TableContainer>
      </MyBox>
    );
  };

  return (
    <MyModal
      isOpen={isOpen}
      minW={['90vw', '712px']}
      onClose={() => handleCloseErrorModal()}
      iconSrc="common/info"
      iconColor="blue.500"
      title={t('dashboard_evaluation:error_info')}
    >
      <ModalBody>
        {(errorList?.tasks || []).length > 0 && (
          <Flex align="center" justify="space-between" mb={4}>
            <Flex align="center">
              <MyIcon name="closeSolid" w={5} h={5} color="red.500" mr={2} />
              <Text fontSize="16px" fontWeight="medium" color={'myGray.900'}>
                {t('dashboard_evaluation:data_generation_error_count', {
                  count: errorList?.tasks.length
                })}
              </Text>
            </Flex>
          </Flex>
        )}
        {renderContent()}
      </ModalBody>
      <ModalFooter>
        <Flex gap={4}>
          <Button variant="outline" size="sm" onClick={handleCloseErrorModal}>
            {t('dashboard_evaluation:cancel')}
          </Button>
          <Button
            variant="solid"
            colorScheme="blue"
            size="sm"
            isLoading={retryAllLoading}
            isDisabled={!errorList?.tasks || errorList?.tasks.length === 0 || isTableLoading}
            onClick={onRetryAll}
          >
            {t('dashboard_evaluation:retry_all')}
          </Button>
        </Flex>
      </ModalFooter>
    </MyModal>
  );
};

export default ErrorModal;
