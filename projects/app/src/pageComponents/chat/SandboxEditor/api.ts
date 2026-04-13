import type {
  SandboxListBody,
  SandboxListResponse,
  SandboxWriteBody,
  SandboxWriteResponse,
  SandboxReadBody,
  SandboxDownloadBody,
  SandboxCheckExistBody,
  SandboxCheckExistResponse,
  SandboxGetHtmlPreviewLinkBody,
  SandboxGetHtmlPreviewLinkResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { parseContentDispositionFilename } from '@fastgpt/global/common/file/tools';
import { POST } from '@/web/common/api/request';

/**
 * 列出目录文件
 */
export const listSandboxFiles = async (data: SandboxListBody) =>
  POST<SandboxListResponse>('/core/ai/sandbox/list', data);

/**
 * 写入文件内容
 */
export const writeSandboxFile = async (data: SandboxWriteBody) =>
  POST<SandboxWriteResponse>('/core/ai/sandbox/write', data);

/**
 * 读取文件内容（内联预览）
 */
export const getSandboxFile = async (data: SandboxReadBody) => {
  const response = await fetch('/api/core/ai/sandbox/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(errText || `Fetch file failed: ${response.status}`);
  }

  return response;
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
