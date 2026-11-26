import React, { useMemo, useRef, useState } from 'react';
import { Button, Flex, HStack, Tag, Text } from '@chakra-ui/react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { POST } from '@/web/common/api/request';
import type {
  TestDocumentParseBody,
  TestDocumentParseResponse
} from '@fastgpt/global/openapi/admin/system/instanceConfig/testDocumentParse';

type DocumentParseTestBarProps = {
  payload: TestDocumentParseBody;
  isDisabled?: boolean;
};

/**
 * 文档增强解析「测试」操作栏：
 * 向后端提交当前草稿或已保存配置，用内置单页测试 PDF 发起真实解析并展示结果与耗时。
 * 任一输入变化时自动清空旧结果并丢弃过期请求响应。
 */
const DocumentParseTestBar = ({ payload, isDisabled = false }: DocumentParseTestBarProps) => {
  const { t } = useSafeTranslation();
  const payloadKey = useMemo(() => JSON.stringify(payload), [payload]);
  const [testState, setTestState] = useState<{
    key: string;
    status: 'testing' | 'complete';
    result?: TestDocumentParseResponse;
  }>();
  const requestIdRef = useRef(0);

  const currentState = testState?.key === payloadKey ? testState : undefined;
  const isTesting = currentState?.status === 'testing';
  const result = currentState?.result;

  const handleTest = async () => {
    if (isDisabled || isTesting) return;
    const requestId = ++requestIdRef.current;
    setTestState({ key: payloadKey, status: 'testing' });

    try {
      const res = await POST<TestDocumentParseResponse>(
        '/admin/system/config/testDocumentParse',
        payload,
        { timeout: 70_000 }
      );
      if (requestIdRef.current !== requestId) return;
      setTestState({ key: payloadKey, status: 'complete', result: res });
    } catch (err: any) {
      if (requestIdRef.current !== requestId) return;
      setTestState({
        key: payloadKey,
        status: 'complete',
        result: {
          success: false,
          responseTimeMs: 0,
          error: typeof err === 'string' ? err : err?.message || t('admin:probe_request_failed')
        }
      });
    }
  };

  return (
    <Flex justifyContent={'flex-end'} alignItems={'center'} flexWrap={'wrap'} gap={3} mt={4}>
      {result && (
        <HStack spacing={2} alignItems={'center'} maxW={'100%'}>
          {result.success ? (
            <>
              <Tag size={'sm'} colorScheme={'green'} variant={'subtle'}>
                {t('admin:test_document_parse_passed')}
              </Tag>
              <Text fontSize={'xs'} color={'myGray.500'}>
                {t('admin:probe_latency')}: {result.responseTimeMs}ms
              </Text>
            </>
          ) : (
            <>
              <Tag size={'sm'} colorScheme={'red'} variant={'subtle'} flexShrink={0}>
                {t('admin:test_document_parse_failed')}
              </Tag>
              {result.error && (
                <Text fontSize={'xs'} color={'red.500'} wordBreak={'break-word'}>
                  {result.error}
                </Text>
              )}
            </>
          )}
        </HStack>
      )}
      <Button
        colorScheme={'blue'}
        variant={'outline'}
        flexShrink={0}
        px={5}
        isLoading={isTesting}
        isDisabled={isDisabled}
        onClick={handleTest}
      >
        {t('admin:test_document_parse_file')}
      </Button>
    </Flex>
  );
};

export default React.memo(DocumentParseTestBar);
