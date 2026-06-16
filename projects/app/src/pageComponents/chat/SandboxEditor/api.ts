import type {
  SandboxDownloadBody,
  SandboxCheckExistBody,
  SandboxCheckExistResponse,
  SandboxGetTicketBody,
  SandboxGetTicketResponse,
  SandboxGetHtmlPreviewLinkBody,
  SandboxGetHtmlPreviewLinkResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { parseContentDispositionFilename } from '@fastgpt/global/common/file/tools';
import { POST } from '@/web/common/api/request';
import { useSystemStore } from '@/web/common/system/useSystemStore';

/**
 * 生成浏览器直连 sandbox proxy 的 WebSocket 地址。
 */
export const getSandboxProxyWsUrl = ({
  channel,
  ticket
}: {
  channel: 'fs' | 'terminal';
  ticket: string;
}) => {
  const { agentSandboxProxyUrl = '' } = useSystemStore.getState().feConfigs;
  const proxyBaseUrl = agentSandboxProxyUrl.replace(/\/+$/, '');

  if (!proxyBaseUrl) {
    throw new Error('AGENT_SANDBOX_PROXY_URL is required but not configured');
  }

  return `${proxyBaseUrl}/${channel}?ticket=${encodeURIComponent(ticket)}`;
};

/**
 * 下载文件或目录（强制下载）
 */
export const downloadSandbox = async (data: SandboxDownloadBody) => {
  const response = await fetch('/api/core/ai/sandbox/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error('Download failed');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  const contentDisposition = response.headers.get('Content-Disposition');
  const fileName =
    parseContentDispositionFilename(contentDisposition || '') || `download-${Date.now()}.zip`;

  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

/**
 * 检查沙盒是否存在
 */
export const checkSandboxExist = async (data: SandboxCheckExistBody) =>
  POST<SandboxCheckExistResponse>('/core/ai/sandbox/checkExist', data);

/**
 * 获取 HTML 预览链接 (S3 托管)
 */
export const getHtmlPreviewLink = (data: SandboxGetHtmlPreviewLinkBody) =>
  POST<SandboxGetHtmlPreviewLinkResponse>('/core/ai/sandbox/getHtmlPreviewLink', data);

export const getSandboxTicket = async (data: SandboxGetTicketBody) =>
  POST<SandboxGetTicketResponse>('/core/ai/sandbox/getTicket', data);
