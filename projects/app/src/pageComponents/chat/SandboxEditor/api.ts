import type {
  SandboxFileOperationBody,
  SandboxFileOperationResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { POST } from '@/web/common/api/request';

/**
 * 列出目录文件
 */
export const listSandboxFiles = async (
  data: Omit<Extract<SandboxFileOperationBody, { action: 'list' }>, 'action'>
) =>
  POST<Extract<SandboxFileOperationResponse, { action: 'list' }>>('/core/ai/sandbox/file', {
    ...data,
    action: 'list' as const
  });

/**
 * 写入文件内容
 */
export const writeSandboxFile = async (
  data: Omit<Extract<SandboxFileOperationBody, { action: 'write' }>, 'action'>
) =>
  POST<Extract<SandboxFileOperationResponse, { action: 'write' }>>('/core/ai/sandbox/file', {
    ...data,
    action: 'write' as const
  });

/**
 * 获取文件内容或预览数据
 */
export const getSandboxFile = async (data: {
  appId: string;
  chatId: string;
  path: string;
  preview?: boolean;
  outLinkAuthData?: any;
}) => {
  const response = await fetch('/api/core/ai/sandbox/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, preview: data.preview ?? true })
  });

  if (!response.ok) {
    throw new Error('Fetch file failed');
  }

  return response;
};

/**
 * 下载文件或目录
 */
export const downloadSandbox = async (data: {
  appId: string;
  chatId: string;
  path?: string;
  outLinkAuthData?: any;
}) => {
  const response = await fetch('/api/core/ai/sandbox/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, preview: false })
  });

  if (!response.ok) {
    throw new Error('Download failed');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  // 从响应头获取文件名
  const contentDisposition = response.headers.get('Content-Disposition');
  const fileNameMatch = contentDisposition?.match(/filename="(.+)"/);
  const fileName = fileNameMatch ? fileNameMatch[1] : `download-${Date.now()}.zip`;

  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

/**
 * 检查沙盒是否存在
 */
export const checkSandboxExist = async (data: {
  appId: string;
  chatId: string;
  outLinkAuthData?: any;
}) => POST<{ exists: boolean }>('/core/ai/sandbox/checkExist', data);
