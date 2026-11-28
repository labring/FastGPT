import { getAxiosHeaderValue } from '@fastgpt/global/common/axios/utils';
import { UserError } from '@fastgpt/global/common/error/utils';
import { isHttpUrl } from '@fastgpt/global/common/string/url';
import { Readable } from 'node:stream';
import { axios } from '../../api/axios';
import { getFileMaxSize } from '../utils';
import { readStreamToBuffer } from '../../s3/utils';

const EXTERNAL_FILE_DOWNLOAD_TIMEOUT_MS = 180_000;

/**
 * 使用统一的 SSRF-safe Axios 打开绝对 HTTP(S) 文件并检查响应头大小。
 * 调用方负责消费/销毁响应流，并在消费边界检查实际字节上限。
 */
export const openExternalFileStream = async ({
  url,
  maxSizeBytes = getFileMaxSize(),
  timeoutMs = EXTERNAL_FILE_DOWNLOAD_TIMEOUT_MS,
  signal
}: {
  url: string;
  maxSizeBytes?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}) => {
  if (!isHttpUrl(url)) {
    throw new UserError('External file URL must be an absolute HTTP(S) URL');
  }

  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new UserError('External file URL must use HTTP(S)');
  }

  const response = await axios.get<Readable>(url, {
    responseType: 'stream',
    timeout: timeoutMs,
    maxContentLength: maxSizeBytes,
    signal
  });
  const contentLength = Number(getAxiosHeaderValue(response.headers['content-length']) || 0);
  if (contentLength > maxSizeBytes) {
    if (response.data instanceof Readable) response.data.destroy();
    throw new UserError(`File exceeds maximum allowed size (${maxSizeBytes} bytes)`);
  }

  const responseStream =
    response.data instanceof Readable
      ? response.data
      : Readable.from([Buffer.from(response.data as unknown as ArrayBuffer)]);

  return {
    stream: responseStream,
    contentType: getAxiosHeaderValue(response.headers['content-type']),
    contentDisposition: getAxiosHeaderValue(response.headers['content-disposition'])
  };
};

/** 有界物化外部文件；流式消费者直接复用同一 URL 校验与响应头检查。 */
export const readExternalFileBuffer = async (options: {
  url: string;
  maxSizeBytes?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onReadBytes?: (readBytes: number) => void;
}) => {
  const { stream, ...metadata } = await openExternalFileStream(options);
  const maxBytes = options.maxSizeBytes ?? getFileMaxSize();
  const buffer = await readStreamToBuffer({
    stream,
    maxBytes,
    signal: options.signal,
    onReadBytes: options.onReadBytes,
    exceededMessage: `File exceeds maximum allowed size (${maxBytes} bytes)`
  });
  return { buffer, ...metadata };
};
