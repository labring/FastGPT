import React, { useMemo } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { getLLMRequestRecordAPI } from '@/web/core/ai/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import dynamic from 'next/dynamic';

const CodeEditor = dynamic(
  () => import('@fastgpt/web/components/common/Textarea/CodeEditor/Editor'),
  {
    ssr: false
  }
);

type RequestIdDetailModalProps = {
  onClose: () => void;
  requestId: string;
};

export const RequestIdDetailModal = ({ onClose, requestId }: RequestIdDetailModalProps) => {
  const { t } = useSafeTranslation();
  const { toast } = useToast();

  // 获取请求记录
  const { data: record, loading } = useRequest(() => getLLMRequestRecordAPI(requestId), {
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
      w={'100%'}
      h={'100%'}
      maxW={['90vw', '1080px']}
      iconSrc="/imgs/modal/wholeRecord.svg"
    >
      {record && (
        <Flex height="100%">
          {/* 请求体 */}
          <Flex
            flex={1}
            bg="myGray.50"
            p={4}
            flexDirection={'column'}
            borderRight={'2px solid'}
            borderColor={'myGray.200'}
          >
            <Text fontWeight="bold" mb={2} fontSize="lg">
              {t('chat:request_body')}
            </Text>
            <Box flex={'1 0 0'} h={0} bg="white" borderRadius="md" overflow="hidden">
              <CodeEditor
                value={formatJson(record.body)}
                language="json"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false
                }}
                h={'100%'}
              />
            </Box>
          </Flex>

          {/* 响应内容 */}
          <Flex flex={1} bg="myGray.50" p={4} flexDirection={'column'}>
            <Text fontWeight="bold" mb={2} fontSize="lg">
              {t('chat:response_content')}
            </Text>
            <Box flex={'1 0 0'} h={0} bg="white" borderRadius="md" overflow="hidden">
              <CodeEditor
                value={formatJson(record.response)}
                language="json"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false
                }}
                h={'100%'}
              />
            </Box>
          </Flex>
        </Flex>
      )}
    </MyModal>
  );
};

export default RequestIdDetailModal;
