import React, { useMemo, useState } from 'react';
import { Box, Button, Flex, Grid, Input } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { McpAuthTabs, McpRegistrationSwitch } from '@/components/core/app/McpAuthControls';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import RadioGroup from '@fastgpt/web/components/common/Radio/RadioGroup';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import type { McpOAuthClientMode } from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import type { McpToolSetOAuthConfigType } from '@fastgpt/global/core/app/tool/mcpTool/oauthConfig';
import type {
  McpOAuthStartBodyType,
  McpOAuthStatusResponseType
} from '@fastgpt/global/openapi/core/app/mcpTools/oauth';
import {
  postDisconnectMcpOAuth,
  postResetMcpOAuthClient,
  postStartMcpOAuth
} from '@/web/core/app/api/mcpToolsOAuth';
import {
  buildMcpOAuthScopeCandidates,
  buildMcpOAuthStartBody,
  formatMcpOAuthTime,
  getMcpOAuthClientSourceI18nKey,
  getMcpOAuthErrorCode,
  getMcpOAuthErrorCopy,
  getMcpOAuthStateI18nKey,
  getMcpOAuthStatePresentation,
  isMcpOAuthManualClientRequiredCode,
  isMcpOAuthPollingState,
  parseMcpOAuthScopeList,
  shouldShowMcpOAuthManualForm,
  toggleMcpOAuthScope,
  validateMcpOAuthManualClient,
  type McpOAuthManualAuthMethod,
  type McpOAuthStateTone,
  type McpOAuthTranslate
} from './utils';

export type McpOAuthConfigProps = {
  appId: string;
  nodeId?: string;
  authMode: 'headers' | 'oauth';
  setAuthMode: (mode: 'headers' | 'oauth') => void;
  clientMode: McpOAuthClientMode;
  setClientMode: (mode: McpOAuthClientMode) => void;
  scope: string;
  setScope: (scope: string) => void;
  oauthConfig?: McpToolSetOAuthConfigType;
  status: McpOAuthStatusResponseType | null;
  statusLoading: boolean;
  refreshStatus: () => Promise<McpOAuthStatusResponseType | undefined>;
  callbackErrorCode: string | null;
  clearCallbackError: () => void;
  canManage: boolean;
  /**
   * 「去授权」前先自动保存当前 URL/authMode/clientMode/scope（设计 §9.2）。
   * 抛错即中止 start，不得带着未保存的配置发起授权。
   */
  onBeforeStart: () => Promise<void>;
};

const AUTH_METHOD_LIST: { title: string; value: McpOAuthManualAuthMethod }[] = [
  { title: 'mcpOAuth.manual_auth_method_none', value: 'none' },
  { title: 'mcpOAuth.manual_auth_method_client_secret_basic', value: 'client_secret_basic' },
  { title: 'mcpOAuth.manual_auth_method_client_secret_post', value: 'client_secret_post' }
];

/** 8 态状态徽标的固定配色（与 utils 的 tone 一一对应）。 */
const STATE_TONE_STYLES: Record<McpOAuthStateTone, { bg: string; color: string; border: string }> =
  {
    neutral: { bg: 'myGray.100', color: 'myGray.700', border: 'myGray.250' },
    info: { bg: 'blue.50', color: 'blue.600', border: 'blue.200' },
    success: { bg: 'green.50', color: 'green.600', border: 'green.200' },
    warning: { bg: 'orange.50', color: 'orange.600', border: 'orange.200' },
    danger: { bg: 'red.50', color: 'red.600', border: 'red.200' }
  };

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Flex alignItems={'center'} minH={'28px'} gap={2}>
    <Box color={'myGray.500'} fontSize={'sm'} minW={'96px'}>
      {label}
    </Box>
    <Box color={'myGray.900'} fontSize={'sm'} flex={1} wordBreak={'break-all'}>
      {children}
    </Box>
  </Flex>
);

const ErrorBanner = ({
  message,
  suggestion,
  code
}: {
  message: string;
  suggestion?: string;
  code?: string;
}) => {
  const { t } = useTranslation();
  if (!message) return null;
  return (
    <Box mt={3} px={3} py={2} borderRadius={'sm'} bg={'red.50'} fontSize={'xs'}>
      <Box color={'red.600'} fontWeight={'medium'}>
        {message}
      </Box>
      {suggestion && (
        <Box mt={1} color={'red.500'}>
          {suggestion}
        </Box>
      )}
      {code && (
        <Box mt={1} color={'myGray.500'}>
          {t('mcpOAuth.error_code', { code })}
        </Box>
      )}
    </Box>
  );
};

const McpOAuthConfig = ({
  appId,
  nodeId,
  authMode,
  setAuthMode,
  clientMode,
  setClientMode,
  scope,
  setScope,
  oauthConfig,
  status,
  statusLoading,
  refreshStatus,
  callbackErrorCode,
  clearCallbackError,
  canManage,
  onBeforeStart
}: McpOAuthConfigProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { openConfirm, ConfirmModal } = useConfirm({ type: 'delete' });

  const [startErrorCode, setStartErrorCode] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [manualClientId, setManualClientId] = useState('');
  const [manualClientSecret, setManualClientSecret] = useState('');
  const [manualAuthMethod, setManualAuthMethod] =
    useState<McpOAuthManualAuthMethod>('client_secret_basic');

  const scopeTokens = useMemo(() => parseMcpOAuthScopeList(scope), [scope]);
  const scopeCandidates = useMemo(
    () =>
      buildMcpOAuthScopeCandidates({
        scopesSupported: oauthConfig?.server?.scopesSupported,
        requestedScope: status?.requestedScope,
        grantedScope: status?.scope
      }),
    [oauthConfig?.server?.scopesSupported, status?.requestedScope, status?.scope]
  );

  const manualRequiredError =
    isMcpOAuthManualClientRequiredCode(startErrorCode) ||
    isMcpOAuthManualClientRequiredCode(status?.lastError?.code);
  const state = status?.state;
  const presentation = getMcpOAuthStatePresentation(state);
  const showManualForm = shouldShowMcpOAuthManualForm({
    clientMode,
    errorCode: startErrorCode ?? callbackErrorCode ?? status?.lastError?.code,
    manuallyOpened: manualOpen
  });

  const startErrorMessage = getMcpOAuthErrorCopy(startErrorCode, t as McpOAuthTranslate);
  const callbackErrorMessage = getMcpOAuthErrorCopy(callbackErrorCode, t as McpOAuthTranslate);

  const { runAsync: runStart, loading: isStarting } = useRequest(
    (data: McpOAuthStartBodyType) => postStartMcpOAuth(data),
    { errorToast: '' }
  );

  const { runAsync: runDisconnect, loading: isDisconnecting } = useRequest(
    () =>
      postDisconnectMcpOAuth({
        appId,
        ...(nodeId ? { nodeId } : {}),
        confirm: true
      }),
    { errorToast: '' }
  );

  const { runAsync: runResetClient, loading: isResetting } = useRequest(
    () =>
      postResetMcpOAuthClient({
        appId,
        ...(nodeId ? { nodeId } : {}),
        confirm: true
      }),
    { errorToast: '' }
  );

  const startOAuth = async () => {
    clearCallbackError();
    setStartErrorCode(null);

    let manualClient: ReturnType<typeof validateMcpOAuthManualClient>['value'];
    if (showManualForm) {
      const validation = validateMcpOAuthManualClient({
        clientId: manualClientId,
        clientSecret: manualClientSecret,
        tokenEndpointAuthMethod: manualAuthMethod
      });
      if (!validation.ok) {
        toast({ title: t(validation.errorKey!), status: 'error' });
        return;
      }
      manualClient = validation.value;
    }

    // 先去授权前保存；保存失败不得继续 start（设计 §9.2）。
    try {
      await onBeforeStart();
    } catch {
      toast({ title: t('mcpOAuth.save_before_start_failed'), status: 'error' });
      return;
    }

    try {
      const res = await runStart(
        buildMcpOAuthStartBody({
          appId,
          nodeId,
          clientMode,
          scope,
          manualClient: manualClient
            ? {
                clientId: manualClient.clientId,
                ...(manualClient.clientSecret ? { clientSecret: manualClient.clientSecret } : {}),
                tokenEndpointAuthMethod: manualClient.tokenEndpointAuthMethod
              }
            : undefined
        })
      );
      if (!res?.authorizationUrl) {
        toast({ title: t('mcpOAuth.start_failed'), status: 'error' });
        return;
      }
      window.location.assign(res.authorizationUrl);
    } catch (error) {
      const code = getMcpOAuthErrorCode(error) ?? null;
      setStartErrorCode(code);
      if (isMcpOAuthManualClientRequiredCode(code)) {
        // auto 链路已确认无法自动注册，展开 manual 表单（保持 auto 语义，作为最后一步）。
        setManualOpen(true);
      }
      const copy = getMcpOAuthErrorCopy(code, t as McpOAuthTranslate);
      toast({
        title: copy.message,
        ...(copy.suggestion ? { description: copy.suggestion } : {}),
        status: 'error'
      });
    }
  };

  const disconnect = () => {
    if (!nodeId) {
      toast({ title: t('mcpOAuth.node_id_missing'), status: 'error' });
      return;
    }
    openConfirm({
      title: t('mcpOAuth.disconnect_confirm_title'),
      customContent: t('mcpOAuth.disconnect_confirm_content'),
      confirmText: t('mcpOAuth.action_disconnect'),
      onConfirm: async () => {
        try {
          await runDisconnect();
          toast({ title: t('mcpOAuth.disconnect_success'), status: 'success' });
          await refreshStatus();
        } catch (error) {
          const copy = getMcpOAuthErrorCopy(getMcpOAuthErrorCode(error), t as McpOAuthTranslate);
          toast({ title: copy.message, status: 'error' });
        }
      }
    })();
  };

  const resetClient = () => {
    if (!nodeId) {
      toast({ title: t('mcpOAuth.node_id_missing'), status: 'error' });
      return;
    }
    openConfirm({
      title: t('mcpOAuth.reset_confirm_title'),
      customContent: t('mcpOAuth.reset_confirm_content'),
      confirmText: t('mcpOAuth.action_reset_client'),
      onConfirm: async () => {
        try {
          await runResetClient();
          toast({ title: t('mcpOAuth.reset_success'), status: 'success' });
          await refreshStatus();
        } catch (error) {
          const copy = getMcpOAuthErrorCopy(getMcpOAuthErrorCode(error), t as McpOAuthTranslate);
          toast({ title: copy.message, status: 'error' });
        }
      }
    })();
  };

  const isReauth = presentation.startActionKey === 'mcpOAuth.action_reauth' || !!callbackErrorCode;
  const canStart =
    canManage &&
    (state === 'headers' || ((!status || presentation.showStart) && (status?.canStart ?? true)));
  const canDisconnect =
    canManage && presentation.showDisconnect && (status?.canDisconnect ?? false);
  const canResetClient = canManage && presentation.showReset && (status?.canResetClient ?? false);
  const clientSource = status?.clientSource;

  return (
    <Box mt={5} pt={5} borderTop={'1px solid'} borderColor={'myGray.150'}>
      <McpAuthTabs value={authMode} onChange={setAuthMode} />
      {authMode === 'oauth' && (
        <Box mt={4}>
          <McpRegistrationSwitch
            value={clientMode}
            onChange={(mode) => {
              setClientMode(mode);
              setManualOpen(false);
              setStartErrorCode(null);
              clearCallbackError();
            }}
          />
          {clientMode === 'auto' && clientSource && (
            <Box mt={3} fontSize={'xs'} color={'myGray.500'}>
              {t('mcpOAuth.auto_client_source_result', {
                source: t(getMcpOAuthClientSourceI18nKey(clientSource))
              })}
            </Box>
          )}

          <Box mt={4}>
            <Flex alignItems={'center'} gap={2}>
              <Box fontSize={'sm'} color={'myGray.700'} fontWeight={'medium'}>
                {t('mcpOAuth.scope')}
              </Box>
              <MyTooltip label={t('mcpOAuth.scope_default_hint')}>
                <MyIcon name={'common/info'} w={'14px'} color={'myGray.500'} />
              </MyTooltip>
            </Flex>
            <Input
              mt={2}
              h={8}
              fontSize={'sm'}
              bg={'white'}
              placeholder={t('mcpOAuth.scope_placeholder')}
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            />
            {scopeCandidates.length > 0 && (
              <Flex mt={2} gap={2} wrap={'wrap'}>
                {scopeCandidates.map((token) => {
                  const active = scopeTokens.includes(token);
                  return (
                    <Box
                      key={token}
                      px={2}
                      py={1}
                      borderRadius={'sm'}
                      cursor={'pointer'}
                      fontSize={'xs'}
                      border={'1px solid'}
                      borderColor={active ? 'primary.300' : 'myGray.250'}
                      bg={active ? 'primary.50' : 'white'}
                      color={active ? 'primary.600' : 'myGray.700'}
                      onClick={() => setScope(toggleMcpOAuthScope(scope, token))}
                    >
                      {token}
                    </Box>
                  );
                })}
              </Flex>
            )}
          </Box>

          {callbackErrorCode && (
            <ErrorBanner
              message={callbackErrorMessage.message}
              suggestion={callbackErrorMessage.suggestion}
              code={callbackErrorCode}
            />
          )}
          {!callbackErrorCode && startErrorCode && (
            <ErrorBanner
              message={startErrorMessage.message}
              suggestion={startErrorMessage.suggestion}
              code={startErrorCode}
            />
          )}
          {manualRequiredError && (
            <Box mt={2} fontSize={'xs'} color={'orange.600'}>
              {t('mcpOAuth.manual_required_hint')}
            </Box>
          )}

          {showManualForm && (
            <Box mt={4} p={3} bg={'white'} border={'1px solid'} borderColor={'myGray.200'}>
              <Box fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
                {t('mcpOAuth.manual_client_title')}
              </Box>
              <Box mt={1} fontSize={'xs'} color={'myGray.500'}>
                {t('mcpOAuth.manual_client_desc')}
              </Box>
              <Grid mt={3} gridTemplateColumns={['1fr', '1fr 1fr']} gap={3}>
                <Box>
                  <Box fontSize={'xs'} color={'myGray.600'} mb={1}>
                    {t('mcpOAuth.manual_client_id')}
                  </Box>
                  <Input
                    h={8}
                    fontSize={'sm'}
                    placeholder={t('mcpOAuth.manual_client_id_placeholder')}
                    value={manualClientId}
                    onChange={(e) => setManualClientId(e.target.value)}
                  />
                </Box>
                <Box>
                  <Box fontSize={'xs'} color={'myGray.600'} mb={1}>
                    {t('mcpOAuth.manual_client_secret')}
                  </Box>
                  <Input
                    h={8}
                    fontSize={'sm'}
                    type={'password'}
                    autoComplete={'new-password'}
                    placeholder={
                      manualAuthMethod === 'none'
                        ? t('mcpOAuth.manual_client_secret_not_required')
                        : t('mcpOAuth.manual_client_secret_placeholder')
                    }
                    isDisabled={manualAuthMethod === 'none'}
                    value={manualClientSecret}
                    onChange={(e) => setManualClientSecret(e.target.value)}
                  />
                </Box>
              </Grid>
              <Box mt={3}>
                <Box fontSize={'xs'} color={'myGray.600'} mb={1}>
                  {t('mcpOAuth.manual_auth_method')}
                </Box>
                <RadioGroup
                  list={AUTH_METHOD_LIST}
                  value={manualAuthMethod}
                  onChange={(value) => setManualAuthMethod(value as McpOAuthManualAuthMethod)}
                />
              </Box>
            </Box>
          )}

          <Box mt={4} p={3} bg={'white'} border={'1px solid'} borderColor={'myGray.200'}>
            <Flex alignItems={'center'} gap={2}>
              <Box fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'} flex={1}>
                {t('mcpOAuth.status_title')}
              </Box>
              {isMcpOAuthPollingState(state) && (
                <Box fontSize={'xs'} color={'primary.600'}>
                  {t('mcpOAuth.polling_hint')}
                </Box>
              )}
              <Button
                size={'xs'}
                variant={'grayGhost'}
                isLoading={statusLoading}
                onClick={() => void refreshStatus()}
              >
                {t('mcpOAuth.action_refresh')}
              </Button>
            </Flex>

            <Box mt={2}>
              <Flex alignItems={'center'} gap={2} mb={2}>
                <Box
                  px={2}
                  py={0.5}
                  borderRadius={'sm'}
                  fontSize={'xs'}
                  fontWeight={'medium'}
                  bg={STATE_TONE_STYLES[presentation.tone].bg}
                  color={STATE_TONE_STYLES[presentation.tone].color}
                  border={'1px solid'}
                  borderColor={STATE_TONE_STYLES[presentation.tone].border}
                >
                  {status ? t(getMcpOAuthStateI18nKey(state)) : '-'}
                </Box>
                <Box fontSize={'xs'} color={'myGray.500'} flex={1}>
                  {t(presentation.hintKey)}
                </Box>
              </Flex>
              {showAdvanced && (
                <>
                  <Field label={t('mcpOAuth.status_state')}>
                    {status ? t(getMcpOAuthStateI18nKey(status.state)) : '-'}
                  </Field>
                  <Field label={t('mcpOAuth.issuer')}>{status?.issuer || '-'}</Field>
                  <Field label={t('mcpOAuth.resource')}>{status?.resource || '-'}</Field>
                  <Field label={t('mcpOAuth.status_scope')}>{status?.scope || '-'}</Field>
                  <Field label={t('mcpOAuth.status_expires_at')}>
                    {formatMcpOAuthTime(status?.expiresAt)}
                  </Field>
                  <Field label={t('mcpOAuth.status_refresh_due_at')}>
                    {formatMcpOAuthTime(status?.refreshDueAt)}
                  </Field>
                  {status?.lastError && (
                    <Field label={t('mcpOAuth.status_last_error')}>
                      <Box color={'red.500'}>
                        {
                          getMcpOAuthErrorCopy(status.lastError.code, t as McpOAuthTranslate)
                            .message
                        }
                      </Box>
                    </Field>
                  )}
                  <Field label={t('mcpOAuth.status_can_start')}>
                    {status ? (status.canStart ? t('mcpOAuth.yes') : t('mcpOAuth.no')) : '-'}
                  </Field>
                  <Field label={t('mcpOAuth.status_can_disconnect')}>
                    {status ? (status.canDisconnect ? t('mcpOAuth.yes') : t('mcpOAuth.no')) : '-'}
                  </Field>
                  <Field label={t('mcpOAuth.status_can_reset_client')}>
                    {status ? (status.canResetClient ? t('mcpOAuth.yes') : t('mcpOAuth.no')) : '-'}
                  </Field>
                </>
              )}
            </Box>
          </Box>

          {canManage && (
            <Flex mt={4} gap={2} wrap={'wrap'}>
              {canStart && (
                <Button size={'sm'} isLoading={isStarting} onClick={startOAuth}>
                  {isReauth ? t('mcpOAuth.action_reauth') : t('mcpOAuth.action_connect')}
                </Button>
              )}
              {canDisconnect && (
                <Button
                  size={'sm'}
                  variant={'whiteDanger'}
                  isLoading={isDisconnecting}
                  onClick={disconnect}
                >
                  {t('mcpOAuth.action_disconnect')}
                </Button>
              )}
              {canResetClient && showAdvanced && (
                <Button
                  size={'sm'}
                  variant={'whiteDanger'}
                  isLoading={isResetting}
                  onClick={resetClient}
                >
                  {t('mcpOAuth.action_reset_client')}
                </Button>
              )}
              <Box flex={1} />
              {
                <Button
                  size={'sm'}
                  variant={'grayGhost'}
                  aria-expanded={showAdvanced}
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                  {t('mcpOAuth.action_advanced')}
                </Button>
              }
            </Flex>
          )}
        </Box>
      )}

      <ConfirmModal />
    </Box>
  );
};

export default React.memo(McpOAuthConfig);
