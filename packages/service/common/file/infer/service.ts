import { isAxiosError, type AxiosResponse } from 'axios';
import { fileTypeFromBuffer } from 'file-type';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { getAxiosHeaderValue } from '@fastgpt/global/common/axios/utils';
import { parseContentDispositionFilename } from '@fastgpt/global/common/file/tools';
import { axios, type SafeAxiosRequestConfig } from '../../api/axios';
import {
  DEFAULT_CONTENT_TYPE,
  normalizeMimeType,
  resolveMimeExtension,
  resolveMimeType
} from '../../s3/utils/mime';

/**
 * 推测 HTTP(S) 文件元数据：HEAD 的明确 MIME → GET 响应头或前 8 KiB 文件签名 → 文件名。
 * HEAD 不支持、被单独拒绝或连接超时时回退 GET；安全策略拒绝及其它请求错误直接抛出。
 * 总请求预算默认 3 秒，HEAD 使用一半预算；GET 即使收到完整响应也只保留前缀并关闭流。
 * 返回原始 URL（保留签名参数）、安全文件名、带点的小写后缀及 MIME；无法识别时后缀可为空。
 * 这是尽力推测，不验证文件完整性；不依赖业务 Context，不登记文件，也不执行业务额度过滤。
 */
export const inferFileTypeFromUrl = async ({
  url,
  timeoutMs = 3000,
  signal,
  validateUrl
}: {
  url: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** 业务 URL 准入策略；初始请求和每次重定向都执行，底层始终保留 SSRF 检查。 */
  validateUrl?: (url: string) => boolean;
}): Promise<{ url: string; filename: string; extension: string; contentType: string }> => {
  const parsedUrl = new URL(url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('External file URL must use HTTP(S)');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 2) {
    throw new Error('File probe timeout must be at least 2 milliseconds');
  }
  signal?.throwIfAborted();

  const maxProbeBytes = 8192;
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('File probe timed out')), timeoutMs);
  const config: SafeAxiosRequestConfig = {
    responseType: 'stream',
    signal: controller.signal,
    timeout: timeoutMs,
    // 文件签名针对原始字节；不解压不受控的远端响应。
    headers: { 'Accept-Encoding': 'identity' },
    decompress: false,
    __safeAxios: { validateUrl }
  };

  /** URL 路径只解码一次；query 和 Content-Disposition 的解析器已经完成解码。 */
  const urlFilename = (() => {
    const queryName = parsedUrl.searchParams.get('filename');
    if (queryName) return queryName;
    try {
      return decodeURIComponent(parsedUrl.pathname);
    } catch {
      return parsedUrl.pathname;
    }
  })();
  let responseFilename = '';

  /** 删除远端名称中的路径和控制字符，后缀与更可靠的 MIME/签名保持一致。 */
  const result = (mime?: string, detectedExtension?: string) => {
    const name = path.posix
      .basename((responseFilename || urlFilename).replace(/\\/g, '/'))
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim();
    const filename = name && name !== '.' && name !== '..' ? name : 'file';
    const originalExtension = path.extname(filename).toLowerCase();
    const contentType = mime ?? resolveMimeType([filename]);
    const extension =
      detectedExtension ??
      (!mime || resolveMimeType([filename], '') === contentType
        ? originalExtension
        : resolveMimeExtension(contentType));
    return {
      url,
      filename: extension
        ? `${filename.slice(0, filename.length - originalExtension.length)}${extension}`
        : filename,
      extension,
      contentType
    };
  };

  /** 缺失或通用二进制 MIME 不构成类型证据，需要读取有限前缀。 */
  const readHeaders = (headers: AxiosResponse['headers']) => {
    const disposition = getAxiosHeaderValue(headers['content-disposition']);
    responseFilename = parseContentDispositionFilename(disposition) || responseFilename;
    const mime = normalizeMimeType(getAxiosHeaderValue(headers['content-type']), '');
    if (!mime || [DEFAULT_CONTENT_TYPE, 'binary/octet-stream', 'application/binary'].includes(mime))
      return;
    return mime;
  };

  try {
    // 1. 优先只取响应头；仅对明确可回退的 HTTP/连接错误尝试 GET。
    try {
      const response = await axios.head<Readable>(url, {
        ...config,
        timeout: Math.floor(timeoutMs / 2)
      });
      response.data?.destroy();
      const mime = readHeaders(response.headers);
      if (mime) return result(mime);
    } catch (error) {
      if (!isAxiosError(error)) throw error;
      error.response?.data?.destroy?.();
      const canRetry =
        [403, 405, 501].includes(error.response?.status ?? 0) ||
        ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET'].includes(error.code ?? '');
      if (!canRetry || controller.signal.aborted) throw error;
    }

    // 2. Range 只是服务端提示，真正的内存上限由客户端截断保证。
    const response = await axios.get<Readable>(url, {
      ...config,
      headers: { ...config.headers, Range: `bytes=0-${maxProbeBytes - 1}` }
    });
    try {
      const mime = readHeaders(response.headers);
      if (mime) return result(mime);
      const encoding = getAxiosHeaderValue(response.headers['content-encoding']);
      if (encoding && encoding.toLowerCase() !== 'identity') return result();
      if (
        response.status === 206 &&
        !/^bytes 0-\d+\/(?:\d+|\*)$/i.test(
          getAxiosHeaderValue(response.headers['content-range']) ?? ''
        )
      )
        throw new Error('File probe requires a range starting at byte zero');

      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of response.data) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const prefix = bytes.subarray(0, maxProbeBytes - size);
        chunks.push(Buffer.from(prefix));
        size += prefix.length;
        if (size === maxProbeBytes) break;
      }
      // 在 CPU 识别之前关闭连接，避免继续接收正文；不把下载错误吞成类型未知。
      response.data.destroy();
      const detected = await fileTypeFromBuffer(Buffer.concat(chunks, size)).catch((error) => {
        // 部分容器格式需要文件尾；有限前缀不足以识别时按未知处理。
        if (error?.name === 'EndOfStreamError' || error?.message === 'End-Of-Stream') return;
        throw error;
      });
      return result(detected?.mime, detected ? `.${detected.ext}` : undefined);
    } finally {
      response.data.destroy();
    }
  } catch (error) {
    // 非 2xx 的 GET 也可能携带未结束的错误正文，不能遗留该流。
    if (isAxiosError<Readable>(error)) error.response?.data?.destroy?.();
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    // 同时释放失败响应和重定向过程中仍持有的连接。
    controller.abort();
  }
};
