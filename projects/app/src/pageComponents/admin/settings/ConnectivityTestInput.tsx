import React, { useState } from 'react';
import { Box, Button, HStack, Input, Tag, Text } from '@chakra-ui/react';
import { POST } from '@/web/common/api/request';
import type { ProbeConnectionResponse } from '@fastgpt/global/openapi/admin/system/instanceConfig';

export type ConnectivityTestInputProps = {
  url: string;
  placeholder?: string;
  buttonText?: string;
  timeoutMs?: number;
  isDisabled?: boolean;
};

/**
 * 连通性测试组件：
 * - 由 readonly input 与测试按钮构成；
 * - 接收 URL 参数，点击按钮后由后端服务发起实际 HTTP 探测并展示连通状态与延迟结果。
 */
const ConnectivityTestInput = ({
  url,
  placeholder = '未配置服务地址',
  buttonText = '连通性测试',
  timeoutMs = 5000,
  isDisabled = false
}: ConnectivityTestInputProps) => {
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState<ProbeConnectionResponse | null>(null);

  const handleTest = async () => {
    if (!url || isTesting || isDisabled) return;

    setIsTesting(true);
    setResult(null);

    try {
      const res = await POST<ProbeConnectionResponse>('/admin/system/config/probe', {
        url,
        timeoutMs
      });
      setResult(res);
    } catch (err: any) {
      setResult({
        connected: false,
        responseTimeMs: 0,
        error: typeof err === 'string' ? err : err?.message || '探测请求发送失败'
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Box w={'100%'}>
      <HStack spacing={3} w={'100%'}>
        <Input
          isReadOnly
          value={url}
          placeholder={placeholder}
          bg={'myGray.50'}
          borderColor={'myGray.200'}
          color={'myGray.800'}
          _focus={{ borderColor: 'primary.500' }}
        />
        <Button
          colorScheme={'blue'}
          variant={'outline'}
          flexShrink={0}
          px={5}
          isLoading={isTesting}
          isDisabled={!url || isDisabled}
          onClick={handleTest}
        >
          {buttonText}
        </Button>
      </HStack>

      {/* 探测结果提示 */}
      {result && (
        <HStack spacing={2} mt={2.5} alignItems={'center'}>
          {result.connected ? (
            <>
              <Tag size={'sm'} colorScheme={'green'} variant={'subtle'}>
                连通正常 ({result.status} {result.statusText})
              </Tag>
              <Text fontSize={'xs'} color={'myGray.500'}>
                延迟: {result.responseTimeMs}ms
              </Text>
            </>
          ) : (
            <>
              <Tag size={'sm'} colorScheme={'red'} variant={'subtle'}>
                连接失败
              </Tag>
              <Text fontSize={'xs'} color={'red.500'}>
                {result.error}
              </Text>
            </>
          )}
        </HStack>
      )}
    </Box>
  );
};

export default React.memo(ConnectivityTestInput);
