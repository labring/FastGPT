import { getAxiosHeaderValue } from '@fastgpt/global/common/axios/utils';
import { UserError } from '@fastgpt/global/common/error/utils';
import { Readable } from 'node:stream';
import { axios } from '../../api/axios';
import { getFileMaxSize } from '../utils';
import { readStreamToBuffer } from '../../s3/utils';

const EXTERNAL_FILE_DOWNLOAD_TIMEOUT_MS = 180_000;

/**
 * 使用统一的 SSRF-safe Axios 下载绝对 HTTP(S) 文件，并执行响应头和流式双重大小限制。
 */
export const readExternalFileBuffer = async ({
  url,
  maxFileSize = getFileMaxSize()
}: {
  url: string;
  maxFileSize?: number;
}) => {
  if (!/^https?:\/\//i.test(url)) {
    throw new UserError('External file URL must be an absolute HTTP(S) URL');
  }

  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new UserError('External file URL must use HTTP(S)');
  }

  const response = await axios.get<Readable>(url, {
    responseType: 'stream',
    timeout: EXTERNAL_FILE_DOWNLOAD_TIMEOUT_MS,
    maxContentLength: maxFileSize
  });
  const contentLength = Number(getAxiosHeaderValue(response.headers['content-length']) || 0);
  if (contentLength > maxFileSize) {
    if (response.data instanceof Readable) response.data.destroy();
    throw new UserError(`File exceeds maximum allowed size (${maxFileSize} bytes)`);
  }

  const responseStream =
    response.data instanceof Readable
      ? response.data
      : Readable.from([Buffer.from(response.data as unknown as ArrayBuffer)]);

  return {
    buffer: await readStreamToBuffer({
      stream: responseStream,
      maxBytes: maxFileSize,
      exceededMessage: `File exceeds maximum allowed size (${maxFileSize} bytes)`
    }),
    contentType: getAxiosHeaderValue(response.headers['content-type']),
    contentDisposition: getAxiosHeaderValue(response.headers['content-disposition'])
  };
};
