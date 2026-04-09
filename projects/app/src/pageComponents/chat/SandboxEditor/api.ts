import type {
  SandboxListBody,
  SandboxListResponse,
  SandboxWriteBody,
  SandboxWriteResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { POST } from '@/web/common/api/request';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

/**
 * 列出目录文件
 */
export const listSandboxFiles = async (
  data: Omit<SandboxListBody, 'outLinkAuthData'> & { outLinkAuthData?: OutLinkChatAuthProps }
) => POST<SandboxListResponse>('/core/ai/sandbox/list', data);

/**
 * 写入文件内容
 */
export const writeSandboxFile = async (
  data: Omit<SandboxWriteBody, 'outLinkAuthData'> & { outLinkAuthData?: OutLinkChatAuthProps }
) => POST<SandboxWriteResponse>('/core/ai/sandbox/write', data);

/**
 * 读取文件内容（内联预览）
 */
export const getSandboxFile = async (data: {
  appId: string;
  chatId: string;
  path: string;
  outLinkAuthData?: OutLinkChatAuthProps;
}) => {
  const response = await fetch('/api/core/ai/sandbox/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    throw new Error('Fetch file failed');
  }

  return response;
};

/**
 * 下载文件或目录（强制下载）
 */
export const downloadSandbox = async (data: {
  appId: string;
  chatId: string;
  path?: string;
  outLinkAuthData?: OutLinkChatAuthProps;
}) => {
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

  const contentDisposition = response.headers.get('Content-Disposition') || '';
  const match = contentDisposition.match(/filename="?([^";]+)"?/i);
  const fileName = match ? decodeURIComponent(match[1]) : `download-${Date.now()}.zip`;

  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

/**
 * 检查沙盒是否存在
 */
export const checkSandboxExist = async (data: {
  appId: string;
  chatId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
}) => POST<{ exists: boolean }>('/core/ai/sandbox/checkExist', data);

/**
 * 获取 HTML 预览链接 (S3 托管)
 */
export const getHtmlPreviewLink = (data: {
  appId: string;
  chatId: string;
  filePath: string;
  outLinkAuthData?: OutLinkChatAuthProps;
}) => POST<string>('/core/ai/sandbox/getHtmlPreviewLink', data);
