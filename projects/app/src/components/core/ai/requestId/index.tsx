import React, { useMemo } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { getLLMRequestRecordAPI } from '@/web/core/ai/api';
import { useToast } from '@fastgpt/web/hooks/useToast';

type RequestIdDetailModalProps = {
  onClose: () => void;
  requestId: string;
};

export const RequestIdDetailModal = ({ onClose, requestId }: RequestIdDetailModalProps) => {
  const { t } = useSafeTranslation();
  const { toast } = useToast();

  // 获取请求记录
  const { data: record, loading } = useRequest2(() => getLLMRequestRecordAPI(requestId), {
    manual: false,
    onError: () => {
      toast({
        status: 'error',
        isClosable: true
      });
    }
  });

  // 格式化 JSON 显示
  const formatJson = useMemo(
    () => (data: any) => {
      return JSON.stringify(data, null, 2);
    },
    []
  );

  return (
    <MyModal
      isCentered
      isOpen
      onClose={onClose}
      title={t('chat:llm_request_detail')}
      isLoading={loading}
      iconSrc="/imgs/modal/wholeRecord.svg"
    >
      {record && (
        <Flex height="70vh" gap={4}>
          {/* 请求体 */}
          <Box flex={1} bg="myGray.50" p={4} borderRadius="md">
            <Text fontWeight="bold" mb={2} fontSize="lg">
              {t('chat:request_body')}
            </Text>
            <Box
              bg="white"
              p={4}
              borderRadius="md"
              overflow="auto"
              maxHeight="calc(70vh - 60px)"
              border="1px solid"
              borderColor="myGray.200"
            >
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'monospace',
                  fontSize: 'sm'
                }}
              >
                {formatJson(record.body)}
              </pre>
            </Box>
          </Box>

          {/* 响应内容 */}
          <Box flex={1} bg="myGray.50" p={4} borderRadius="md">
            <Text fontWeight="bold" mb={2} fontSize="lg">
              {t('chat:response_content')}
            </Text>
            <Box
              bg="white"
              p={4}
              borderRadius="md"
              overflow="auto"
              maxHeight="calc(70vh - 60px)"
              border="1px solid"
              borderColor="myGray.200"
            >
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'monospace',
                  fontSize: 'sm'
                }}
              >
                {formatJson(record.response)}
              </pre>
            </Box>
          </Box>
        </Flex>
      )}
    </MyModal>
  );
};

export default RequestIdDetailModal;
