import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { McpOAuthStatusResponseType } from '@fastgpt/global/openapi/core/app/mcpTools/oauth';
import { getMcpOAuthStatus } from '@/web/core/app/api/mcpToolsOAuth';
import {
  MCP_OAUTH_POLL_INTERVAL_MS,
  MCP_OAUTH_POLL_MAX_DURATION_MS,
  getMcpOAuthErrorCode,
  shouldPollMcpOAuthStatus
} from './utils';

/**
 * MCP OAuth 状态查询与有限轮询（设计 §9.3）。
 *
 * - 进入页面 / 回调后立即查一次；
 * - 仅页面可见且 state ∈ {pending_authorization, refreshing, refresh_due} 时每 5s 轮询；
 * - 页面隐藏、终态、超过 5 分钟或组件卸载都会停止并清理定时器；
 * - in-flight 去重，轮询请求不并发叠加；
 * - 查询失败不覆盖已有 status，避免一次网络抖动显示成「未授权」。
 */
export const useMcpOAuthStatus = ({
  appId,
  nodeId,
  enabled
}: {
  appId: string;
  nodeId?: string;
  enabled: boolean;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [status, setStatus] = useState<McpOAuthStatusResponseType | null>(null);
  const [loading, setLoading] = useState(false);
  const [pollStopped, setPollStopped] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
  );

  const inFlightRef = useRef(false);
  const pollStartedAtRef = useRef<number | null>(null);

  const refresh = useCallback(async (): Promise<McpOAuthStatusResponseType | undefined> => {
    if (!appId || inFlightRef.current) return undefined;
    inFlightRef.current = true;
    setLoading(true);
    try {
      const next = await getMcpOAuthStatus({ appId, ...(nodeId ? { nodeId } : {}) });
      setStatus(next);
      return next;
    } catch (error) {
      // 不覆盖已有 status；仅停止轮询并提示，未知错误码不制造「未授权」假象。
      setPollStopped(true);
      const code = getMcpOAuthErrorCode(error);
      toast({
        title: t('mcpOAuth.status_refresh_failed'),
        description: code ? t('mcpOAuth.error_unknown', { code }) : undefined,
        status: 'error'
      });
      return undefined;
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [appId, nodeId, t, toast]);

  /** 用户手动刷新：重置轮询窗口与失败停止标记。 */
  const manualRefresh = useCallback(async () => {
    pollStartedAtRef.current = Date.now();
    setPollStopped(false);
    return refresh();
  }, [refresh]);

  // 页面可见性变化时立即生效；隐藏页不轮询。
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onChange = () => setDocumentVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  // 进入 oauth 模式 / 切换节点时拉一次。
  useEffect(() => {
    if (!enabled || !appId) {
      setStatus(null);
      setPollStopped(false);
      pollStartedAtRef.current = null;
      return;
    }
    pollStartedAtRef.current = Date.now();
    void refresh();
    // refresh 只依赖 appId/nodeId，切换节点时重新拉取。
  }, [enabled, appId, nodeId, refresh]);

  // 5s 轮询：仅可见 + 进行中状态 + 未因失败/超时停止。
  const pollingState = status?.state;
  useEffect(() => {
    if (!enabled || pollStopped) return;
    if (pollStartedAtRef.current === null) pollStartedAtRef.current = Date.now();

    const elapsedMs = Date.now() - pollStartedAtRef.current;
    if (!shouldPollMcpOAuthStatus({ state: pollingState, documentVisible, elapsedMs })) return;

    const timer = setInterval(() => {
      const startedAt = pollStartedAtRef.current ?? Date.now();
      if (Date.now() - startedAt >= MCP_OAUTH_POLL_MAX_DURATION_MS) {
        setPollStopped(true);
        return;
      }
      void refresh();
    }, MCP_OAUTH_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, documentVisible, pollStopped, pollingState, refresh]);

  return {
    status,
    setStatus,
    loading,
    pollStopped,
    refresh,
    manualRefresh
  };
};
