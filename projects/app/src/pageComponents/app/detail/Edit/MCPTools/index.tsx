import { Flex } from '@chakra-ui/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from './Header';
import Edit from './Edit';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../context';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { McpToolSetRuntimeConfigSchema } from '@fastgpt/global/core/workflow/type/node';
import { type McpToolConfigType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import type { McpOAuthClientMode } from '@fastgpt/global/core/app/tool/mcpTool/oauth';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getMCPTools, postUpdateMCPTools } from '@/web/core/app/api/mcpTools';
import { useMcpOAuthStatus } from './oauth/useMcpOAuthStatus';
import { parseMcpOAuthCallbackQuery } from './oauth/utils';

const MCPTools = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const appId = useContextSelector(AppContext, (v) => v.appId);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);

  const toolSetNode = useMemo(
    () => appDetail.nodes.find((item) => item.flowNodeType === FlowNodeTypeEnum.toolSet),
    [appDetail.nodes]
  );
  const nodeId = toolSetNode?.nodeId ? String(toolSetNode.nodeId) : undefined;
  const runtimeToolSet = useMemo(() => {
    const raw = toolSetNode?.toolConfig?.mcpToolSet ?? toolSetNode?.inputs?.[0]?.value;
    if (!raw) return undefined;
    const parsed = McpToolSetRuntimeConfigSchema.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  }, [toolSetNode]);

  const [url, setUrl] = useState(runtimeToolSet?.url || '');
  const [toolList, setToolList] = useState<McpToolConfigType[]>(runtimeToolSet?.toolList || []);
  const [headerSecret, setHeaderSecret] = useState<StoreSecretValueType>(
    runtimeToolSet?.headerSecret ?? {}
  );
  const [authMode, setAuthMode] = useState<'headers' | 'oauth'>(
    runtimeToolSet?.authMode ?? 'headers'
  );
  const [clientMode, setClientMode] = useState<McpOAuthClientMode>(
    runtimeToolSet?.oauth?.clientMode ?? 'auto'
  );
  const [scope, setScope] = useState<string>(runtimeToolSet?.oauth?.scope ?? '');
  const [currentTool, setCurrentTool] = useState<McpToolConfigType | undefined>(
    runtimeToolSet?.toolList?.[0]
  );
  const [callbackErrorCode, setCallbackErrorCode] = useState<string | null>(null);

  const { status, loading: statusLoading, refresh: refreshStatus } = useMcpOAuthStatus({
    appId,
    nodeId,
    enabled: authMode === 'oauth'
  });

  const saveCurrent = useCallback(
    async (overrides?: { authMode?: 'headers' | 'oauth'; toolList?: McpToolConfigType[] }) => {
      await postUpdateMCPTools({
        appId,
        url,
        toolList: overrides?.toolList ?? toolList,
        headerSecret,
        authMode: overrides?.authMode ?? authMode,
        clientMode,
        scope
      });
    },
    [appId, url, toolList, headerSecret, authMode, clientMode, scope]
  );

  /** 「去授权」前先自动保存当前 URL/authMode/clientMode/scope（设计 §9.2）。 */
  const saveBeforeStart = useCallback(async () => {
    await saveCurrent();
  }, [saveCurrent]);

  const callbackHandledRef = useRef(false);

  // 授权回调：success 自动拉取工具并落库；error 按错误码展示（不自动重试）。
  useEffect(() => {
    if (!router.isReady) return;
    const callback = parseMcpOAuthCallbackQuery(router.query);
    if (!callback || callbackHandledRef.current) return;
    callbackHandledRef.current = true;

    // 移除一次性 query，避免刷新页面重复执行。
    const nextQuery = { ...router.query };
    delete nextQuery.oauth;
    delete nextQuery.code;
    void router.replace({ pathname: router.pathname, query: nextQuery }, undefined, {
      shallow: true
    });

    if (callback.kind === 'error') {
      setCallbackErrorCode(callback.code ?? null);
      return;
    }

    void (async () => {
      try {
        const tools = await getMCPTools({ appId, ...(nodeId ? { nodeId } : {}) });
        setToolList(tools);
        setCurrentTool(tools[0]);
        await saveCurrent({ authMode: 'oauth', toolList: tools });
        toast({ title: t('mcpOAuth.callback_success'), status: 'success' });
      } catch (error) {
        toast({ title: t('mcpOAuth.callback_fetch_tools_failed'), status: 'error' });
      } finally {
        await refreshStatus();
      }
    })();
    // 回调只处理一次；saveCurrent/refreshStatus 随状态变化不应重新触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.oauth, router.query.code, appId, nodeId]);

  const clearCallbackError = useCallback(() => setCallbackErrorCode(null), []);

  return (
    <Flex h={'100%'} flexDirection={'column'} px={[3, 0]} pr={[3, 3]} bg={'myGray.25'}>
      <Header onSave={saveCurrent} />
      <Edit
        appId={appId}
        nodeId={nodeId}
        url={url}
        setUrl={setUrl}
        toolList={toolList}
        setToolList={setToolList}
        currentTool={currentTool}
        setCurrentTool={setCurrentTool}
        headerSecret={headerSecret}
        setHeaderSecret={setHeaderSecret}
        authMode={authMode}
        setAuthMode={setAuthMode}
        clientMode={clientMode}
        setClientMode={setClientMode}
        scope={scope}
        setScope={setScope}
        oauthConfig={runtimeToolSet?.oauth}
        status={status}
        statusLoading={statusLoading}
        refreshStatus={refreshStatus}
        callbackErrorCode={callbackErrorCode}
        clearCallbackError={clearCallbackError}
        onBeforeStart={saveBeforeStart}
        onBeforeParse={() => saveCurrent()}
      />
    </Flex>
  );
};

export default React.memo(MCPTools);
