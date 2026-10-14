import FormData from 'form-data';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { UserError } from '@fastgpt/global/common/error/utils';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { parseMarkdownBase64Images } from '@fastgpt/global/common/string/markdown';
import type { IultmzhFileParseConfigType } from '@fastgpt/global/core/dataset/type';
import z from 'zod';
import { axiosWithoutSSRF } from '../../common/api/axios';
import { getLogger, LogCategories } from '../../common/logger';
import { getImageBuffer } from '../../common/file/image/utils';
import { uploadParsedPdfImage, type ParsedPdfImageKeyOptions } from '../../common/file/read/image';
import { getSystemInstanceConfig } from '../../common/system/systemInstanceConfig/controller';
import { serviceEnv } from '../../env';
import { appendIultmzhFileParseFields } from './parseConfig';

const logger = getLogger(LogCategories.MODULE.DATASET.FILE);

const SangforParseResponseSchema = z.object({
  pages: z.number().int().nonnegative(),
  markdown: z.string()
});

/** Only configured formats use Sangfor; other files retain the original parser chain. */
export const useSangforParse = (extension: string): boolean => {
  const documentParse = getSystemInstanceConfig().providers.documentParse;
  const provider = documentParse.provider || serviceEnv.DOCUMENT_PARSE_PROVIDER;
  if (provider !== 'sangfor') return false;

  // 地址/凭据以 providers.documentParse.sangfor 为权威（Admin 提供商页写入处）；
  // customPdfParse 桥接值仅作存量兼容兜底：迁移把 CUSTOM_PDF_PARSE_URL/KEY 同时
  // 写入 sangfor.*，历史部署两处取值一致，故兜底不改变行为。
  const sangforUrl = documentParse.sangfor.url || global.systemEnv?.customPdfParse?.url;
  if (!sangforUrl) return false;

  const normalizeExtension = (value: string) => value.trim().toLowerCase().replace(/^\./, '');
  const rawExtensions =
    documentParse.sangfor.extensions || serviceEnv.SANGFOR_PARSE_EXTENSIONS;
  const extensions = rawExtensions.split(',').map(normalizeExtension).filter(Boolean);
  return extensions.includes(normalizeExtension(extension));
};

/** 服务可返回的失败标识白名单 = 已注册的 6 个 statusText（不含任何厂商私有码）。 */
export const ACCEPTED_PARSE_STATUS_TEXTS = new Set<string>([
  CommonErrEnum.pdfParseFailed,
  CommonErrEnum.unsupportedParseFileType,
  CommonErrEnum.invalidParseFile,
  CommonErrEnum.officeConversionFailed,
  CommonErrEnum.docxParseInvalid,
  CommonErrEnum.docxConversionFailed
]);

/** 取服务返回的通用失败标识（响应体顶层 `statusText`）。 */
export const resolveParseStatusText = (error: unknown): string | undefined => {
  const e = error as any;
  const v = e?.response?.data?.statusText;
  return typeof v === 'string' && v ? v : undefined;
};

/**
 * 通用失败标识 → UserError。始终返回，保证用户永远看不到内部错误文本。
 * 标识缺失 / 不在白名单 → 兜底 pdfParseFailed。
 */
export const toParseFailedError = (error: unknown): UserError => {
  const statusText = resolveParseStatusText(error);
  const accepted =
    statusText && ACCEPTED_PARSE_STATUS_TEXTS.has(statusText)
      ? statusText
      : CommonErrEnum.pdfParseFailed;
  return new UserError(accepted);
};

/**
 * Parses an already materialized document through Sangfor while preserving the legacy
 * custom-service protocol. File source materialization stays in the caller.
 */
export const parseFromSangfor = async ({
  fileBuffer,
  extension,
  imageKeyOptions,
  sangforFileParseConfig
}: {
  fileBuffer: Buffer;
  extension: string;
  imageKeyOptions?: ParsedPdfImageKeyOptions;
  sangforFileParseConfig?: IultmzhFileParseConfigType;
}) => {
  const documentParse = getSystemInstanceConfig().providers.documentParse;
  // 地址/凭据以 sangfor 域为权威来源（Admin 提供商页写入处），customPdfParse 桥接值
  // 仅作存量兼容兜底；迁移把 CUSTOM_PDF_PARSE_URL/KEY 同时写入两处，存量部署取值一致。
  const { url, key } = {
    url: documentParse.sangfor.url || global.systemEnv?.customPdfParse?.url,
    key: documentParse.sangfor.key || global.systemEnv?.customPdfParse?.key
  };
  if (!url) {
    throw new Error('[sangfor] providers.documentParse.sangfor.url is required');
  }

  try {
    const form = new FormData();
    form.append('file', fileBuffer, { filename: `file.${extension}` });
    appendIultmzhFileParseFields(form, sangforFileParseConfig);
    // sangfor.url 由部署方/root 管理员配置，可能指向内网解析服务，不使用 SSRF 拦截器。
    const timeoutSeconds =
      documentParse.sangfor.timeoutSeconds || serviceEnv.SANGFOR_PARSE_TIMEOUT_SECONDS;
    const { data } = await axiosWithoutSSRF.post<unknown>(url, form, {
      timeout: timeoutSeconds * 1000,
      headers: {
        ...form.getHeaders(),
        Authorization: key ? `Bearer ${key}` : undefined
      }
    });

    if (data && typeof data === 'object' && 'error' in data && data.error) {
      throw data.error;
    }

    const response = SangforParseResponseSchema.parse(data);
    const text = await parseMarkdownBase64Images(response.markdown, {
      parseBase64: true,
      parseHttp: true,
      controller: imageKeyOptions?.prefix
        ? async (image) => {
            if (image.type === 'base64') {
              return uploadParsedPdfImage(
                {
                  type: 'base64',
                  mime: image.mime,
                  dataUrl: image.dataUrl
                },
                imageKeyOptions
              );
            }

            const { buffer, mime } = await getImageBuffer(image.url);
            return uploadParsedPdfImage(
              {
                type: 'http',
                mime,
                buffer
              },
              imageKeyOptions
            );
          }
        : undefined
    });

    return {
      pages: response.pages,
      text
    };
  } catch (error) {
    const statusText = resolveParseStatusText(error);
    const mapped = toParseFailedError(error);
    // 原始信息只进日志，不进用户可见文案；不透传 error 对象，避免记录完整厂商响应体
    logger.warn('Sangfor document parse request failed', {
      statusText,
      mappedStatusText: mapped.message,
      detail: getErrText(error)
    });
    throw mapped;
  }
};
