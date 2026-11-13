import type {
  SandboxDownloadBody,
  SandboxCheckExistBody,
  SandboxCheckExistResponse,
  SandboxGetFilePreviewLinkBody,
  SandboxGetFilePreviewLinkResponse,
  SandboxUploadQuery,
  SandboxUploadResponse,
  SandboxFsListBody,
  SandboxFsListResponse,
  SandboxFsMkdirBody,
  SandboxFsMoveBody,
  SandboxFsDeleteBody,
  SandboxFsExecBody,
  SandboxGetTicketBody,
  SandboxGetTicketResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import type { ExecuteResult } from '@fastgpt/global/core/ai/sandbox/type';
import { parseContentDispositionFilename } from '@fastgpt/global/common/file/tools';
import { POST, POSTRawFile } from '@/web/common/api/request';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { getLanguageRequestHeaders } from '@fastgpt/web/i18n/utils';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';

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
type SandboxGetFilePreviewLinkClientBody = SandboxClientBody<SandboxGetFilePreviewLinkBody>;
type SandboxUploadClientQuery = SandboxClientBody<SandboxUploadQuery>;
type SandboxFsListClientBody = SandboxClientBody<SandboxFsListBody>;
type SandboxFsMkdirClientBody = SandboxClientBody<SandboxFsMkdirBody>;
type SandboxFsMoveClientBody = SandboxClientBody<SandboxFsMoveBody>;
type SandboxFsDeleteClientBody = SandboxClientBody<SandboxFsDeleteBody>;
type SandboxFsExecClientBody = SandboxClientBody<SandboxFsExecBody>;
type SandboxGetTicketClientBody = SandboxClientBody<SandboxGetTicketBody>;

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

type SandboxResponseError = Error & {
  status: number;
};

/**
 * 从非 2xx 原始响应中提取服务端错误文案，并附带 HTTP status 供上层区分 404 与瞬态故障。
 */
const createSandboxResponseError = async (
  response: Response,
  fallbackMessage: string
): Promise<SandboxResponseError> => {
  const errorBody = (await response.json().catch(() => null)) as { message?: unknown } | null;
  const serverMessage = typeof errorBody?.message === 'string' ? errorBody.message.trim() : '';
  const message = serverMessage ? serverMessage : fallbackMessage;
  return Object.assign(new Error(message), { status: response.status });
};

const fetchSandboxDownloadResponse = (data: SandboxDownloadClientBody) =>
  fetch(getWebReqUrl('/api/core/ai/sandbox/download'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getLanguageRequestHeaders()
    },
    body: JSON.stringify(normalizeSandboxRequest(data))
  });

/**
 * 下载文件或目录并触发浏览器本地保存。
 */
export const downloadSandbox = async (data: SandboxDownloadClientBody) => {
  const response = await fetchSandboxDownloadResponse(data);

  if (!response.ok) {
    throw await createSandboxResponseError(response, 'Download failed');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  const contentDisposition = response.headers.get('Content-Disposition');
  const parsedFileName = parseContentDispositionFilename(contentDisposition ?? '');
  const fileName = parsedFileName ? parsedFileName : `download-${Date.now()}.zip`;

  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

/**
 * 读取沙盒文件原始字节和并发版本；size 使用实际收到的字节数，避免依赖目录缓存或响应头。
 */
export const readSandboxFile = async (
  data: SandboxDownloadClientBody
): Promise<{ bytes: Uint8Array; etag?: string; size: number }> => {
  const response = await fetchSandboxDownloadResponse(data);

  if (!response.ok) {
    throw await createSandboxResponseError(response, 'Read failed');
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  return { bytes, etag: response.headers.get('ETag') ?? undefined, size: bytes.byteLength };
};

/**
 * 检查沙盒是否存在
 */
export const checkSandboxExist = async (data: SandboxCheckExistClientBody) =>
  POST<SandboxCheckExistResponse>('/core/ai/sandbox/checkExist', normalizeSandboxRequest(data));

/** 获取文件预览代理链接及过期时间，供媒体内嵌预览和 HTML 独立窗口使用。 */
export const getFilePreviewLink = (data: SandboxGetFilePreviewLinkClientBody) =>
  POST<SandboxGetFilePreviewLinkResponse>(
    '/core/ai/sandbox/getFilePreviewLink',
    normalizeSandboxRequest(data)
  );

/**
 * 单层列出沙盒目录（depth=1 懒加载）
 */
export const listSandboxDirectory = (data: SandboxFsListClientBody) =>
  POST<SandboxFsListResponse>('/core/ai/sandbox/fs/list', normalizeSandboxRequest(data));

/**
 * 创建沙盒目录
 */
export const mkdirSandboxDirectory = (data: SandboxFsMkdirClientBody) =>
  POST<void>('/core/ai/sandbox/fs/mkdir', normalizeSandboxRequest(data));

/**
 * 移动或重命名沙盒文件/目录
 */
export const moveSandboxEntry = (data: SandboxFsMoveClientBody) =>
  POST<void>('/core/ai/sandbox/fs/move', normalizeSandboxRequest(data));

/**
 * 删除沙盒文件/目录
 */
export const deleteSandboxEntry = (data: SandboxFsDeleteClientBody) =>
  POST<void>('/core/ai/sandbox/fs/delete', normalizeSandboxRequest(data));

/**
 * 在当前沙盒会话目录内执行命令
 */
export const execSandboxCommand = (data: SandboxFsExecClientBody) =>
  POST<ExecuteResult>('/core/ai/sandbox/fs/exec', normalizeSandboxRequest(data));

/**
 * 将 Blob 或 File 作为原始请求体写入 sandbox；编辑保存可传 oldEtag 校验并发修改。
 */
export const uploadSandboxFile = async ({
  file,
  ...data
}: SandboxUploadClientQuery & { file: Blob }) => {
  return POSTRawFile<SandboxUploadResponse>({
    url: '/core/ai/sandbox/upload',
    file,
    query: normalizeSandboxRequest(data),
    config: {
      timeout: 10 * 60 * 1000
    }
  });
};

/**
 * 签发连接 `opensandbox-proxy` 的短期交互式终端票据与 WebSocket 地址。
 */
export const getSandboxTerminalTicket = (data: SandboxGetTicketClientBody) =>
  POST<SandboxGetTicketResponse>('/core/ai/sandbox/getTicket', normalizeSandboxRequest(data));
