import React, { useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
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

  const { data: record, loading } = useRequest(() => getLLMRequestRecordAPI(requestId), {
    manual: false,
    onError: () => {
      toast({
        status: 'error',
        isClosable: true
      });
      setTimeout(() => {
        onClose();
      }, 1000);
    }
  });

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
      title={
        <Box fontSize={'20px'} lineHeight={'26px'} letterSpacing={'0.15px'} fontWeight={500}>
          {t('chat:llm_request_detail')}
        </Box>
      }
      isLoading={loading}
      w={['90vw', '1080px']}
      maxW={['90vw', '1080px']}
      h={['90vh', '80vh']}
      maxH={['90vh', '700px']}
      px={0}
      py={8}
      headerPx={'32px'}
    >
      {record && (
        <Flex height={'100%'} mx={'32px'} gap={4}>
          <Flex flex={1} flexDirection={'column'} gap={2} minW={0}>
            <Box
              fontSize={'12px'}
              lineHeight={'16px'}
              fontWeight={500}
              color={'myGray.900'}
              letterSpacing={'0.5px'}
            >
              {t('chat:request_body')}
            </Box>
            <Box
              flex={'1 0 0'}
              h={0}
              bg={'white'}
              border={'1px solid'}
              borderColor={'myGray.200'}
              borderRadius={'8px'}
              overflow={'hidden'}
            >
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

          <Flex flex={1} flexDirection={'column'} gap={2} minW={0}>
            <Box
              fontSize={'12px'}
              lineHeight={'16px'}
              fontWeight={500}
              color={'myGray.900'}
              letterSpacing={'0.5px'}
            >
              {t('chat:response_content')}
            </Box>
            <Box
              flex={'1 0 0'}
              h={0}
              bg={'white'}
              border={'1px solid'}
              borderColor={'myGray.200'}
              borderRadius={'8px'}
              overflow={'hidden'}
            >
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
