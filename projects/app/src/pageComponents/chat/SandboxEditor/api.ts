import type {
  SandboxDownloadBody,
  SandboxExtractZipBody,
  SandboxExtractZipResponse,
  SandboxCheckExistBody,
  SandboxCheckExistResponse,
  SandboxGetTicketBody,
  SandboxGetTicketResponse,
  SandboxGetHtmlPreviewLinkBody,
  SandboxGetHtmlPreviewLinkResponse,
  SandboxUploadQuery,
  SandboxUploadResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { POST, POSTRawFile } from '@/web/common/api/request';
import { downloadFetch, fetchApiResponse } from '@/web/common/system/utils';
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
type SandboxExtractZipClientBody = SandboxClientBody<SandboxExtractZipBody>;
type SandboxUploadClientQuery = SandboxClientBody<SandboxUploadQuery>;

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
 * 下载文件或目录（强制下载）
 */
export const downloadSandbox = (data: SandboxDownloadClientBody) =>
  downloadFetch({
    url: '/api/core/ai/sandbox/download',
    body: normalizeSandboxRequest(data),
    fallbackFilename: `download-${Date.now()}.zip`
  });

/**
 * 读取沙盒文件原始字节，供大文件绕过 ide-agent WebSocket JSON RPC 读取。
 */
export const readSandboxFile = async (data: SandboxDownloadClientBody) => {
  const response = await fetchApiResponse({
    url: '/api/core/ai/sandbox/download',
    body: normalizeSandboxRequest(data)
  });

  return new Uint8Array(await response.arrayBuffer());
};

/**
 * 检查沙盒是否存在
 */
export const checkSandboxExist = async (data: SandboxCheckExistClientBody) =>
  POST<SandboxCheckExistResponse>('/core/ai/sandbox/checkExist', normalizeSandboxRequest(data));

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
 * 解压沙盒会话工作区内的 .zip 文件到不冲突的同名目录
 */
export const extractSandboxZip = async (data: SandboxExtractZipClientBody) =>
  POST<SandboxExtractZipResponse>('/core/ai/sandbox/extractZip', normalizeSandboxRequest(data));

/**
 * 将文件作为原始请求体流式写入 sandbox，避免 WebSocket base64 和主站临时文件。
 */
export const uploadSandboxFile = async ({
  file,
  ...data
}: SandboxUploadClientQuery & { file: File }) => {
  return POSTRawFile<SandboxUploadResponse>({
    url: '/core/ai/sandbox/upload',
    file,
    query: normalizeSandboxRequest(data),
    config: {
      timeout: 10 * 60 * 1000
    }
  });
};
