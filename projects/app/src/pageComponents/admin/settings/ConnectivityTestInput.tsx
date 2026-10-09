import React, { useState } from 'react';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { Box, Button, HStack, Input, Tag, Text, type InputProps } from '@chakra-ui/react';
import { POST } from '@/web/common/api/request';
import type { ProbeConnectionResponse } from '@fastgpt/global/openapi/admin/system/instanceConfig/probe';
import AdminReadonlyInput from './AdminReadonlyInput';

export type ConnectivityTestInputProps = Omit<InputProps, 'value' | 'onChange'> & {
  url?: string;
  value?: string;
  testUrl?: string;
  testPath?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  buttonText?: string;
  timeoutMs?: number;
  isDisabled?: boolean;
  isEditable?: boolean;
};

/**
 * 连通性测试组件：
 * - 支持只读展示或直接编辑输入（通过 isEditable 控制），右侧集成测试按钮；
 * - 接收 url 或 value 参数，点击按钮后由后端服务发起实际 HTTP 探测并展示连通状态与延迟结果。
 */
const ConnectivityTestInput = ({
  url,
  value,
  testUrl,
  testPath,
  onChange,
  placeholder,
  buttonText,
  timeoutMs = 5000,
  isDisabled = false,
  isEditable = false,
  ...inputProps
}: ConnectivityTestInputProps) => {
  const { t } = useClientTranslation('admin');
  const [isTesting, setIsTesting] = useState(false);
  const resolvedButtonText = buttonText ?? t('admin:probe_button');
  const resolvedPlaceholder = placeholder ?? t('admin:not_configured_service_address');
  const [result, setResult] = useState<ProbeConnectionResponse | null>(null);

  const effectiveUrl = value !== undefined ? value : url || '';

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (result) {
      setResult(null);
    }
    onChange?.(e);
  };

  const resolveTargetUrl = () => {
    if (testUrl) return testUrl;
    if (!effectiveUrl) return '';
    if (testPath) {
      const base = effectiveUrl.replace(/\/+$/, '');
      const path = testPath.startsWith('/') ? testPath : '/' + testPath;
      return base + path;
    }
    return effectiveUrl;
  };

  const handleTest = async () => {
    const targetUrl = resolveTargetUrl();
    if (!targetUrl || isTesting || isDisabled) return;

    setIsTesting(true);
    setResult(null);

    try {
      const res = await POST<ProbeConnectionResponse>('/admin/system/config/probe', {
        url: targetUrl,
        timeoutMs
      });
      setResult(res);
    } catch (err: any) {
      setResult({
        connected: false,
        responseTimeMs: 0,
        error: typeof err === 'string' ? err : err?.message || t('admin:probe_request_failed')
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Box w={'100%'}>
      <HStack spacing={3} w={'100%'}>
        <Box flex={'1 0 0'} minW={0}>
          {isEditable ? (
            <Input
              value={effectiveUrl}
              onChange={handleInputChange}
              placeholder={resolvedPlaceholder}
              isDisabled={isDisabled}
              bg={'white'}
              {...inputProps}
            />
          ) : (
            <AdminReadonlyInput value={effectiveUrl} placeholder={resolvedPlaceholder} isTruncate />
          )}
        </Box>
        {/* 禁用条件与 resolveTargetUrl 一致：testUrl 可独立提供探测目标，不能只看 effectiveUrl */}
        <Button
          colorScheme={'blue'}
          variant={'outline'}
          flexShrink={0}
          px={5}
          isLoading={isTesting}
          isDisabled={(!effectiveUrl && !testUrl) || isDisabled}
          onClick={handleTest}
        >
          {resolvedButtonText}
        </Button>
      </HStack>

      {/* 探测结果提示 */}
      {result && (
        <HStack spacing={2} mt={2.5} alignItems={'center'}>
          {result.connected ? (
            <>
              <Tag
                size={'sm'}
                colorScheme={
                  result.status && result.status >= 200 && result.status < 400 ? 'green' : 'orange'
                }
                variant={'subtle'}
              >
                {result.status && result.status >= 200 && result.status < 400
                  ? t('admin:probe_connected')
                  : t('admin:probe_warning')}{' '}
                ({result.status} {result.statusText})
              </Tag>
              <Text fontSize={'xs'} color={'myGray.500'}>
                {t('admin:probe_latency')}: {result.responseTimeMs}ms
              </Text>
            </>
          ) : (
            <>
              <Tag size={'sm'} colorScheme={'red'} variant={'subtle'}>
                {t('admin:probe_failed')}
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
