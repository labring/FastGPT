import React, { useMemo, useRef, useState } from 'react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { Box, Button, HStack, Input, Tag, Text, type InputProps } from '@chakra-ui/react';
import { POST } from '@/web/common/api/request';
import type {
  ProbeConnectionBody,
  ProbeConnectionResponse
} from '@fastgpt/global/openapi/admin/system/instanceConfig/probe';
import AdminReadonlyInput from './AdminReadonlyInput';

export type ConnectivityTestInputProps = Omit<InputProps, 'value' | 'onChange'> & {
  url?: string;
  value?: string;
  testUrl?: string;
  testPath?: string;
  service?: ProbeConnectionBody['service'];
  token?: string;
  useStoredToken?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  buttonText?: string;
  buttonVariant?: string;
  timeoutMs?: number;
  isDisabled?: boolean;
  isEditable?: boolean;
  renderLayout?: (parts: {
    input: React.ReactNode;
    button: React.ReactNode;
    result: React.ReactNode;
  }) => React.ReactNode;
};

/**
 * 连通性测试组件：
 * - 支持只读展示或直接编辑输入（通过 isEditable 控制），右侧集成测试按钮；
 * - 接收 url 或 value 参数，点击按钮后由后端服务发起实际 HTTP 探测并展示连通状态与延迟结果。
 */
function ConnectivityTestInput(
  {
    url,
    value,
    testUrl,
    testPath,
    service,
    token,
    useStoredToken = false,
    onChange,
    placeholder,
    buttonText,
    buttonVariant = 'outline',
    timeoutMs = 5000,
    isDisabled = false,
    isEditable = false,
    renderLayout,
    ...inputProps
  }: ConnectivityTestInputProps,
  ref: React.ForwardedRef<HTMLInputElement>
) {
  const { t } = useSafeTranslation();
  const resolvedButtonText = buttonText ?? t('admin:probe_button');
  const resolvedPlaceholder = placeholder ?? t('admin:not_configured_service_address');
  const effectiveUrl = value ?? url ?? '';
  // 结果绑定完整输入快照；外部重置、凭据修改或禁用后不会展示旧结果。
  const probeInputs = useMemo(
    () => ({
      effectiveUrl,
      testUrl,
      testPath,
      service,
      token,
      useStoredToken,
      timeoutMs,
      isDisabled
    }),
    [effectiveUrl, testUrl, testPath, service, token, useStoredToken, timeoutMs, isDisabled]
  );
  const [probeState, setProbeState] = useState<{
    inputs: typeof probeInputs;
    status: 'testing' | 'complete';
    result?: ProbeConnectionResponse;
  }>();
  /** 递增请求编号保证后发请求不会被先前请求覆盖。 */
  const probeRequestIdRef = useRef(0);
  const currentProbe = probeState?.inputs === probeInputs ? probeState : undefined;
  const isTesting = currentProbe?.status === 'testing';
  const result = currentProbe?.result;

  /** 使用字面量 i18n key，保证静态扫描能提取探测错误文案。 */
  const getProbeErrorText = (response: ProbeConnectionResponse) => {
    switch (response.errorCode) {
      case 'protocol':
        return t('admin:probe_error_protocol');
      case 'timeout':
        return t('admin:probe_error_timeout');
      case 'refused':
        return t('admin:probe_error_refused');
      case 'dns':
        return t('admin:probe_error_dns');
      case 'response':
        return t('admin:probe_error_response');
      case 'unknown':
        return t('admin:probe_error_unknown');
      default:
        return response.error;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 地址一旦变化，正在等待的旧探测结果就不再对应当前输入，必须丢弃。
    probeRequestIdRef.current += 1;
    setProbeState(undefined);
    onChange?.(e);
  };

  const resolveTargetUrl = () => {
    if (testUrl?.trim()) return testUrl.trim();
    if (!effectiveUrl.trim()) return '';
    if (testPath) {
      const base = effectiveUrl.trim().replace(/\/+$/, '');
      const path = testPath.startsWith('/') ? testPath : '/' + testPath;
      return base + path;
    }
    return effectiveUrl.trim();
  };

  const handleTest = async () => {
    const targetUrl = resolveTargetUrl();
    if (!targetUrl || isTesting || isDisabled) return;

    const requestId = ++probeRequestIdRef.current;
    setProbeState({ inputs: probeInputs, status: 'testing' });

    try {
      const res = await POST<ProbeConnectionResponse>('/admin/system/config/probe', {
        url: targetUrl,
        timeoutMs,
        ...(service ? { service } : {}),
        ...(service === 'codeSandbox'
          ? { ...(token !== undefined ? { token } : {}), useStoredToken }
          : {})
      });
      if (probeRequestIdRef.current !== requestId) return;
      setProbeState({ inputs: probeInputs, status: 'complete', result: res });
    } catch (err: any) {
      if (probeRequestIdRef.current !== requestId) return;
      setProbeState({
        inputs: probeInputs,
        status: 'complete',
        result: {
          connected: false,
          responseTimeMs: 0,
          error: typeof err === 'string' ? err : err?.message || t('admin:probe_request_failed')
        }
      });
    }
  };

  const input = isEditable ? (
    <Input
      ref={ref}
      value={effectiveUrl}
      onChange={handleInputChange}
      placeholder={resolvedPlaceholder}
      isDisabled={isDisabled}
      bg={'white'}
      {...inputProps}
    />
  ) : (
    <AdminReadonlyInput value={effectiveUrl} placeholder={resolvedPlaceholder} isTruncate />
  );
  // 禁用条件与 resolveTargetUrl 一致：testUrl 可独立提供探测目标。
  const button = (
    <Button
      colorScheme={'blue'}
      variant={buttonVariant}
      flexShrink={0}
      px={5}
      isLoading={isTesting}
      isDisabled={(!effectiveUrl.trim() && !testUrl?.trim()) || isDisabled}
      onClick={handleTest}
    >
      {resolvedButtonText}
    </Button>
  );
  const resultContent = result && (
    <HStack spacing={2} alignItems={'center'}>
      {result.connected ? (
        <>
          <Tag
            size={'sm'}
            colorScheme={
              result.status === undefined || (result.status >= 200 && result.status < 400)
                ? 'green'
                : 'orange'
            }
            variant={'subtle'}
          >
            {result.status === undefined || (result.status >= 200 && result.status < 400)
              ? t('admin:probe_connected')
              : t('admin:probe_warning')}
            {result.status !== undefined &&
              ` (${result.status}${result.statusText ? ` ${result.statusText}` : ''})`}
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
            {result.errorCode ? getProbeErrorText(result) : result.error}
          </Text>
        </>
      )}
    </HStack>
  );

  if (renderLayout) return <>{renderLayout({ input, button, result: resultContent })}</>;

  return (
    <Box w={'100%'}>
      <HStack spacing={3} w={'100%'}>
        <Box flex={'1 0 0'} minW={0}>
          {input}
        </Box>
        {button}
      </HStack>
      {resultContent && <Box mt={2.5}>{resultContent}</Box>}
    </Box>
  );
}

export default React.memo(React.forwardRef(ConnectivityTestInput));
