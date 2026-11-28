import FormData from 'form-data';
import z from 'zod';
import { isValidHttpUrl } from '@fastgpt/global/common/string/url';
import type { IultmzhFileParseConfigType } from '@fastgpt/global/core/dataset/type';
import { axiosWithoutSSRF } from '../../api/axios';
import { appendIultmzhFileParseFields } from '../../../thirdProvider/sangfor/parseConfig';

export const CustomPdfParseResponseSchema = z.object({
  pages: z.number().int().nonnegative(),
  markdown: z.string()
});

export type CustomPdfParseResponse = z.infer<typeof CustomPdfParseResponseSchema>;

/**
 * 向管理员配置的自建或深信服文档解析服务发起 multipart/form-data 请求并校验返回协议。
 *
 * 自建与深信服服务地址均由 root 管理员在系统配置中维护，允许指向内网或本机部署；
 * 运行时与后台「测试」统一复用 axiosWithoutSSRF（保留代理路由与响应体上限），
 * 解析结果 Markdown 中的图片 URL 仍由上层下载链路执行 SSRF 校验。
 */
export const requestMultipartDocumentParse = async ({
  url,
  key,
  fileBuffer,
  filename,
  contentType,
  timeoutMs,
  sangforFileParseConfig
}: {
  url: string;
  key?: string;
  fileBuffer: Buffer;
  filename: string;
  contentType?: string;
  timeoutMs: number;
  sangforFileParseConfig?: IultmzhFileParseConfigType;
}): Promise<CustomPdfParseResponse> => {
  const trimmedUrl = url.trim();
  if (!trimmedUrl || !isValidHttpUrl(trimmedUrl)) {
    throw new Error('Invalid parser service URL');
  }

  const form = new FormData();
  form.append('file', fileBuffer, {
    filename,
    ...(contentType ? { contentType } : {})
  });
  appendIultmzhFileParseFields(form, sangforFileParseConfig);

  const { data } = await axiosWithoutSSRF.post<unknown>(trimmedUrl, form, {
    timeout: timeoutMs,
    headers: {
      ...form.getHeaders(),
      Authorization: key?.trim() ? `Bearer ${key.trim()}` : undefined
    }
  });

  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw data.error;
  }

  return CustomPdfParseResponseSchema.parse(data);
};
