import FormData from 'form-data';
import z from 'zod';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { isValidHttpUrl, isValidServiceBaseUrl } from '@fastgpt/global/common/string/url';
import { resolveSomarkBaseUrl } from '@fastgpt/global/common/system/config/schemas/providers';
import type {
  TestDocumentParseProvider,
  TestDocumentParseResponse
} from '@fastgpt/global/openapi/admin/system/instanceConfig/testDocumentParse';
import { axiosWithoutSSRF } from '../../api/axios';
import { useSomarkServer } from '../../../thirdProvider/somark';
import { useDoc2xServer } from '../../../thirdProvider/doc2x';
import { useTextinServer } from '../../../thirdProvider/textin';

const DEFAULT_DOCUMENT_PARSE_TEST_TIMEOUT_MS = 60_000;

const CustomParseResponseSchema = z.object({
  pages: z.number().int().nonnegative(),
  markdown: z.string()
});

/**
 * 构造符合 PDF 1.4 规范的最小单页测试 PDF，包含精确 xref 偏移与可渲染文本，
 * 避免仓库携带二进制夹具，同时兼容主流 PDF/OCR 解析引擎。
 */
export const buildSampleTestPdfBuffer = (): Buffer => {
  const streamBody = 'BT /F1 18 Tf 72 720 Td (FastGPT PDF Parse Test) Tj ET\n';
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(streamBody, 'utf8')} >>\nstream\n${streamBody}endstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  ];

  const header = '%PDF-1.4\n';
  const parts: string[] = [header];
  const offsets: number[] = [];
  let cursor = Buffer.byteLength(header, 'utf8');

  for (const obj of objects) {
    offsets.push(cursor);
    parts.push(obj);
    cursor += Buffer.byteLength(obj, 'utf8');
  }

  const xrefOffset = cursor;
  parts.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) {
    parts.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
  }
  parts.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  return Buffer.from(parts.join(''), 'utf8');
};

const sanitizeTestError = (rawError: unknown, secrets: Array<string | undefined>): string => {
  let message = getErrText(rawError, 'Document parse test failed').trim();
  for (const secret of secrets) {
    const trimmed = secret?.trim();
    if (trimmed && trimmed.length >= 4) {
      message = message.split(trimmed).join('***');
    }
  }
  return message.slice(0, 300);
};

export type TestDocumentParseParams = {
  provider: TestDocumentParseProvider;
  url?: string;
  key?: string;
  somarkBaseUrl?: string;
  somarkApiKey?: string;
  doc2xKey?: string;
  textinAppId?: string;
  textinSecretCode?: string;
  timeoutMs?: number;
};

/**
 * 使用内置单页测试 PDF 对指定文档增强解析服务发起真实解析测试。
 * 仅验证端到端连通性、凭据与返回协议，不写入对象存储也不产生业务计费记录。
 */
export const testDocumentParseProvider = async ({
  provider,
  url,
  key,
  somarkBaseUrl,
  somarkApiKey,
  doc2xKey,
  textinAppId,
  textinSecretCode,
  timeoutMs = DEFAULT_DOCUMENT_PARSE_TEST_TIMEOUT_MS
}: TestDocumentParseParams): Promise<TestDocumentParseResponse> => {
  const startTime = Date.now();
  const responseTimeMs = () => Date.now() - startTime;
  const samplePdf = buildSampleTestPdfBuffer();
  const secrets = [key, somarkApiKey, doc2xKey, textinAppId, textinSecretCode];

  const parseMultipartEndpoint = async (endpointUrl: string, authKey?: string) => {
    const trimmedUrl = endpointUrl.trim();
    if (!trimmedUrl || !isValidHttpUrl(trimmedUrl)) {
      throw new Error('Invalid parser service URL');
    }
    const form = new FormData();
    form.append('file', samplePdf, {
      filename: 'sample.pdf',
      contentType: 'application/pdf'
    });
    // 管理员配置的自建/深信服解析地址可能位于内网，使用 axiosWithoutSSRF，同时保持响应协议校验。
    const { data } = await axiosWithoutSSRF.post<unknown>(trimmedUrl, form, {
      timeout: timeoutMs,
      headers: {
        ...form.getHeaders(),
        Authorization: authKey?.trim() ? `Bearer ${authKey.trim()}` : undefined
      }
    });
    if (data && typeof data === 'object' && 'error' in data && data.error) {
      throw data.error;
    }
    const parsed = CustomParseResponseSchema.parse(data);
    return { pages: parsed.pages };
  };

  try {
    if (provider === 'somark') {
      const apiKey = somarkApiKey?.trim();
      if (!apiKey) throw new Error('Somark API Key is required');
      const resolvedBaseUrl = resolveSomarkBaseUrl(somarkBaseUrl);
      if (!isValidServiceBaseUrl(resolvedBaseUrl)) {
        throw new Error('Invalid SoMark base URL');
      }
      const { pages } = await useSomarkServer({
        apiKey,
        baseUrl: resolvedBaseUrl,
        timeoutMs
      }).parsePDF(samplePdf);
      return { success: true, pages, responseTimeMs: responseTimeMs() };
    }

    if (provider === 'doc2x') {
      const apiKey = doc2xKey?.trim();
      if (!apiKey) throw new Error('Doc2X Key is required');
      const { pages } = await useDoc2xServer({ apiKey, timeoutMs }).parsePDF(samplePdf);
      return { success: true, pages, responseTimeMs: responseTimeMs() };
    }

    if (provider === 'textin' || provider === 'textln') {
      const appId = textinAppId?.trim();
      const secretCode = textinSecretCode?.trim();
      if (!appId || !secretCode) {
        throw new Error('TextIn AppId and Secret Code are required');
      }
      const { pages } = await useTextinServer({ appId, secretCode, timeoutMs }).parsePDF(samplePdf);
      return { success: true, pages, responseTimeMs: responseTimeMs() };
    }

    if (provider === 'customPdf' || provider === 'custom' || provider === 'sangfor') {
      const { pages } = await parseMultipartEndpoint(url ?? '', key);
      return { success: true, pages, responseTimeMs: responseTimeMs() };
    }

    throw new Error(`Unsupported document parse provider: ${provider}`);
  } catch (error) {
    return {
      success: false,
      responseTimeMs: responseTimeMs(),
      error: sanitizeTestError(error, secrets)
    };
  }
};
