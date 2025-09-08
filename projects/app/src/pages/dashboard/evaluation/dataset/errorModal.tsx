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
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

interface ErrorInfo {
  id: string;
  title: string;
  status: number;
  errorMessage: string;
}

interface BatchErrorInfo {
  id: string;
  knowledgeTitle: string;
  status: number;
  errorMessage: string;
}

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorType: 'single' | 'batch' | 'all';
  errorInfo?: ErrorInfo;
  batchErrors?: BatchErrorInfo[];
  onRetry?: (id?: string) => void;
  onDelete?: (id: string) => void;
  onRetryAll?: () => void;
  onDeleteFile?: () => void;
}

const sampleBatchErrors: BatchErrorInfo[] = [
  {
    id: '1',
    knowledgeTitle: '知识库1',
    status: 2,
    errorMessage: '负体的报错文案'
  },
  {
    id: '2',
    knowledgeTitle: '知识库2',
    status: 4,
    errorMessage: '负体的报错文案'
  },
  {
    id: '3',
    knowledgeTitle: '知识库3',
    status: 7,
    errorMessage: '负体的报错文案'
  }
];

// Mock data function that returns a promise
const getMockData = async (): Promise<{ list: BatchErrorInfo[]; total: number }> => {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  return {
    list: sampleBatchErrors,
    total: sampleBatchErrors.length
  };
};

const ErrorModal = ({
  isOpen,
  onClose,
  errorType,
  errorInfo,
  batchErrors = sampleBatchErrors,
  onRetry,
  onDelete,
  onRetryAll,
  onDeleteFile
}: ErrorModalProps) => {
  const { t } = useTranslation();
  const {
    data: errorList,
    ScrollData,
    isLoading,
    refreshList
  } = useScrollPagination(getMockData, {
    pageSize: 15,
    params: {},
    EmptyTip: <EmptyTip />
  });

  // 渲染全部异常场景
  const renderAllErrorContent = () => (
    <ModalBody>
      <Box bg="red.50" px={8} py={6} borderRadius="md" mb={6} mt={'38px'} mx={75}>
        <Flex align="center" mb={4}>
          <MyIcon name="closeSolid" w={5} h={5} color="red" mr={2} />
          <Text fontSize="16px" fontWeight="medium" color="myGray.900">
            {t('dashboard_evaluation:file_parse_error')}
          </Text>
        </Flex>
        <Text fontSize="14px" color="myGray.600" mb={2}>
          {t('dashboard_evaluation:error_message')}:
        </Text>
        <Text fontSize="14px" color="myGray.900" lineHeight="1.5">
          Failed to load resource: the server responded with a status of X<br />
          Failed to load resource: the server responded with a status of X<br />
          Failed to load resource: the server responded with a status of X
        </Text>
      </Box>
      <Flex gap={4} mt={8} mb={'38px'} justifyContent={'center'}>
        <Button variant="outline" size="sm" onClick={onClose}>
          {t('dashboard_evaluation:delete_file')}
        </Button>
        <Button variant="solid" colorScheme="blue" size="sm">
          {t('dashboard_evaluation:reparse')}
        </Button>
      </Flex>
    </ModalBody>
  );

  // 渲染批量异常场景
  const renderBatchErrorContent = () => (
    <>
      <ModalBody>
        <Flex align="center" justify="space-between" mb={4}>
          <Flex align="center">
            <MyIcon name="common/error" w={4} h={4} color="red.500" mr={2} />
            <Text fontSize="16px" fontWeight="medium" color="red.500">
              {t('条数据生成异常', { count: batchErrors.length })}
            </Text>
          </Flex>
        </Flex>
        <ScrollData h={'400px'}>
          <TableContainer overflowY={'auto'} fontSize={'12px'}>
            <Table variant="simple">
              <Thead>
                <Tr>
                  <Th>{t('dashboard_evaluation:source_knowledge_base')}</Th>
                  <Th>{t('dashboard_evaluation:source_chunk')}</Th>
                  <Th>{t('dashboard_evaluation:error_message')}</Th>
                  <Th w={'110px'}>{t('dashboard_evaluation:operations')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {errorList.map((error, index) => (
                  <Tr key={index}>
                    <Td>{error.knowledgeTitle}</Td>
                    <Td>{error.status}</Td>
                    <Td isTruncated>{error.errorMessage}</Td>
                    <Td w={'110px'}>
                      <Flex alignItems={'center'}>
                        <Button
                          variant={'ghost'}
                          size={'sm'}
                          color={'myGray.600'}
                          leftIcon={<MyIcon name={'common/confirm/restoreTip'} w={4} />}
                          fontSize={'mini'}
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
                        >
                          {t('dashboard_evaluation:delete')}
                        </Button>
                      </Flex>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </ScrollData>
      </ModalBody>
      <ModalFooter>
        <Flex gap={4}>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('dashboard_evaluation:cancel')}
          </Button>
          <Button variant="solid" colorScheme="blue" size="sm">
            {t('dashboard_evaluation:retry_all')}
          </Button>
        </Flex>
      </ModalFooter>
    </>
  );

  return (
    <MyModal
      isOpen={isOpen}
      minW={['90vw', '712px']}
      onClose={onClose}
      iconSrc="common/info"
      iconColor="blue.500"
      title={t('dashboard_evaluation:error_info')}
    >
      {errorType === 'all' ? renderAllErrorContent() : renderBatchErrorContent()}
    </MyModal>
  );
};

export default ErrorModal;
