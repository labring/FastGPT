import type {
  SandboxDownloadBody,
  SandboxCheckExistBody,
  SandboxCheckExistResponse,
  SandboxGetTicketBody,
  SandboxGetTicketResponse,
  SandboxGetHtmlPreviewLinkBody,
  SandboxGetHtmlPreviewLinkResponse,
  SandboxUploadBody,
  SandboxUploadResponse,
  SandboxRuntimeBody
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import type { SandboxRuntimeStatusResponse } from '@fastgpt/global/core/ai/sandbox/type';
import { parseContentDispositionFilename } from '@fastgpt/global/common/file/tools';
import { POST } from '@/web/common/api/request';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

type SandboxRawTargetRequest = {
  appId?: unknown;
  skillId?: unknown;
  outLinkAuthData?: OutLinkChatAuthProps;
};

type SandboxClientBody<T> = Omit<T, 'outLinkAuthData'> & {
  outLinkAuthData?: OutLinkChatAuthProps;
};
type SandboxDownloadClientBody = SandboxClientBody<SandboxDownloadBody>;
type SandboxCheckExistClientBody = SandboxClientBody<SandboxCheckExistBody>;
type SandboxGetTicketClientBody = SandboxClientBody<SandboxGetTicketBody>;
type SandboxGetHtmlPreviewLinkClientBody = SandboxClientBody<SandboxGetHtmlPreviewLinkBody>;
type SandboxUploadClientBody = SandboxClientBody<SandboxUploadBody>;
type SandboxRuntimeClientBody = SandboxClientBody<SandboxRuntimeBody>;

/**
 * share 模式下后端 schema 要求只传 outLinkAuthData，真实 appId 由鉴权解析。
 * 这里统一规整 sandbox 请求，避免各入口都重复判断分享外链上下文。
 */
const normalizeSandboxRequest = <T extends SandboxRawTargetRequest>(data: T): T => {
  const hasShareAuth = !!(data.outLinkAuthData?.shareId && data.outLinkAuthData.outLinkUid);

  if (!hasShareAuth || typeof data.appId !== 'string' || data.skillId) {
    return data;
  }

  return { ...data, appId: undefined } as T;
};

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

  return `${proxyBaseUrl}/${channel}?ticket=${encodeURIComponent(ticket)}`;
};

/**
 * 下载文件或目录（强制下载）
 */
const fetchSandboxDownloadResponse = (data: SandboxDownloadClientBody) =>
  fetch('/api/core/ai/sandbox/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeSandboxRequest(data))
  });

export const downloadSandbox = async (data: SandboxDownloadClientBody) => {
  const response = await fetchSandboxDownloadResponse(data);

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
 * 读取沙盒文件原始字节，供大文件绕过 ide-agent WebSocket JSON RPC 读取。
 */
export const readSandboxFile = async (data: SandboxDownloadClientBody) => {
  const response = await fetchSandboxDownloadResponse(data);

  if (!response.ok) {
    throw new Error('Read failed');
  }

  return new Uint8Array(await response.arrayBuffer());
};

/**
 * 检查沙盒是否存在
 */
export const checkSandboxExist = async (data: SandboxCheckExistClientBody) =>
  POST<SandboxCheckExistResponse>('/core/ai/sandbox/checkExist', normalizeSandboxRequest(data));

/** 获取 App 用户级 Sandbox runtime 镜像升级状态。 */
export const getSandboxRuntimeStatus = (data: SandboxRuntimeClientBody) =>
  POST<SandboxRuntimeStatusResponse>(
    '/core/ai/sandbox/runtime/getStatus',
    normalizeSandboxRequest(data)
  );

/** 启动 App 用户级 Sandbox runtime 镜像升级归档。 */
export const upgradeSandboxRuntime = (data: SandboxRuntimeClientBody) =>
  POST<SandboxRuntimeStatusResponse>(
    '/core/ai/sandbox/runtime/upgrade',
    normalizeSandboxRequest(data)
  );

/**
 * 获取 HTML 预览链接（agent-proxy 直连 sandbox workspace）
 */
export const getHtmlPreviewLink = (data: SandboxGetHtmlPreviewLinkClientBody) =>
  POST<SandboxGetHtmlPreviewLinkResponse>(
    '/core/ai/sandbox/getHtmlPreviewLink',
    normalizeSandboxRequest(data)
  );

export const getSandboxTicket = async (data: SandboxGetTicketClientBody) =>
  POST<SandboxGetTicketResponse>('/core/ai/sandbox/getTicket', normalizeSandboxRequest(data));

/**
 * 通过主站 API 复用 sandbox provider 文件上传能力，避免走 ide-agent WebSocket base64。
 */
export const uploadSandboxFile = async ({
  file,
  ...data
}: SandboxUploadClientBody & { file: File }) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('data', JSON.stringify(normalizeSandboxRequest(data)));

  return POST<SandboxUploadResponse>('/core/ai/sandbox/upload', formData, {
    timeout: 10 * 60 * 1000
  });
};
