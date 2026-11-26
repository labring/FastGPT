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
 * MCP OAuth 状态查询与有限轮询。
 *
 * - 进入页面 / 回调后立即查一次；
 * - 仅 `pending_authorization` / `refreshing` 每 2s 轮询；
 * - 最长 5 分钟；终态、超时或组件卸载都会停止并清理定时器；
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

  // 进入 oauth 模式 / 切换节点时拉一次。
  useEffect(() => {
    if (!enabled || !appId) {
      // 关闭 oauth 模式时清空状态，避免下次进入显示上一次的授权态。
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 模式切换需同步重置外部状态
      setStatus(null);
      setPollStopped(false);
      pollStartedAtRef.current = null;
      return;
    }
    pollStartedAtRef.current = Date.now();
    void refresh();
    // refresh 只依赖 appId/nodeId，切换节点时重新拉取。
  }, [enabled, appId, nodeId, refresh]);

  // 2s 轮询：仅进行中状态 + 未因失败/超时停止。
  const pollingState = status?.state;
  useEffect(() => {
    if (!enabled || pollStopped) return;
    if (pollStartedAtRef.current === null) pollStartedAtRef.current = Date.now();

    const elapsedMs = Date.now() - pollStartedAtRef.current;
    if (!shouldPollMcpOAuthStatus({ state: pollingState, elapsedMs })) return;

    const timer = setInterval(() => {
      const startedAt = pollStartedAtRef.current ?? Date.now();
      if (Date.now() - startedAt >= MCP_OAUTH_POLL_MAX_DURATION_MS) {
        setPollStopped(true);
        return;
      }
      void refresh();
    }, MCP_OAUTH_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, pollStopped, pollingState, refresh]);

  return {
    status,
    setStatus,
    loading,
    pollStopped,
    refresh,
    manualRefresh
  };
};
