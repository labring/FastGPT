import z from 'zod';
import { isValidServiceBaseUrl, stripUrlTrailingSlash } from '../../../string/url';
import { textWithDefault, urlWithDefault } from './primitives';

export const SOMARK_BASE_URL_GLOBAL = 'https://somark.ai/api/v1';
export const SOMARK_BASE_URL_CN = 'https://somark.cn/api/v1';

export const PDF_PARSE_TIMEOUT_MIN_SECONDS = 60;
export const PDF_PARSE_TIMEOUT_MAX_SECONDS = 7200;
export const PDF_PARSE_TIMEOUT_DEFAULT_SECONDS = 600;

export type SomarkRegionPreset = 'global' | 'cn' | 'custom';

/** 规范化 SoMark API 基础地址：去除首尾空白和尾部斜杠，空值回退国际站。 */
export const resolveSomarkBaseUrl = (baseUrl?: string): string => {
  const normalized = stripUrlTrailingSlash(baseUrl?.trim());
  return normalized || SOMARK_BASE_URL_GLOBAL;
};

/** 按存储的 SoMark Base URL 推导前端区域选项；空值或国际站地址统一归为国际站。 */
export const getSomarkRegionPreset = (baseUrl?: string): SomarkRegionPreset => {
  const normalized = stripUrlTrailingSlash(baseUrl?.trim());
  if (!normalized || normalized === SOMARK_BASE_URL_GLOBAL) return 'global';
  if (normalized === SOMARK_BASE_URL_CN) return 'cn';
  return 'custom';
};

/** SoMark 会在基地址后追加 /parse/sync，禁止凭据、查询参数和片段；空值兼容旧配置并回退国际站。 */
const somarkBaseUrlSchema = z
  .string()
  .trim()
  .refine((value) => value === '' || isValidServiceBaseUrl(value), {
    message: 'Expected an HTTP(S) base URL without credentials, query or fragment'
  })
  .default(SOMARK_BASE_URL_GLOBAL);

const DocumentParseProviderConfigSchema = z.strictObject({
  provider: z
    .enum(['none', 'customPdf', 'custom', 'somark', 'doc2x', 'textin', 'textln', 'sangfor'])
    .default('none'),
  customPdf: z
    .strictObject({
      url: urlWithDefault(),
      key: textWithDefault(),
      somarkBaseUrl: somarkBaseUrlSchema,
      somarkApiKey: textWithDefault(),
      doc2xKey: textWithDefault(),
      textinAppId: textWithDefault(),
      textinSecretCode: textWithDefault(),
      timeoutSeconds: z
        .number()
        .int()
        .min(PDF_PARSE_TIMEOUT_MIN_SECONDS)
        .max(PDF_PARSE_TIMEOUT_MAX_SECONDS)
        .default(PDF_PARSE_TIMEOUT_DEFAULT_SECONDS),
      price: z.number().nonnegative().default(0)
    })
    .prefault({
      url: '',
      key: '',
      somarkBaseUrl: SOMARK_BASE_URL_GLOBAL,
      somarkApiKey: '',
      doc2xKey: '',
      textinAppId: '',
      textinSecretCode: '',
      timeoutSeconds: PDF_PARSE_TIMEOUT_DEFAULT_SECONDS,
      price: 0
    }),
  sangfor: z
    .strictObject({
      url: urlWithDefault(),
      key: textWithDefault(),
      extensions: z.string().default('pdf'),
      // 保留 v4.17.5 已发布的 SANGFOR_PARSE_TIMEOUT_SECONDS >= 1 下限，避免老配置（如 45s）升级后阻断核心页保存。
      timeoutSeconds: z
        .number()
        .int()
        .min(1)
        .max(PDF_PARSE_TIMEOUT_MAX_SECONDS)
        .default(PDF_PARSE_TIMEOUT_DEFAULT_SECONDS)
    })
    .prefault({
      url: '',
      key: '',
      extensions: 'pdf',
      timeoutSeconds: PDF_PARSE_TIMEOUT_DEFAULT_SECONDS
    })
});

/** 外部提供商注入到工作流的全局变量定义。 */
const ExternalProviderWorkflowVarConfigSchema = z.strictObject({
  name: z.string().max(100),
  key: z.string().max(100),
  intro: z.string().max(1000).default(''),
  isOpen: z.boolean().default(true),
  url: textWithDefault()
});

export const ProvidersConfigBaseSchema = z.strictObject({
  documentParse: DocumentParseProviderConfigSchema.prefault({}),
  externalProviderWorkflowVariables: z
    .array(ExternalProviderWorkflowVarConfigSchema)
    .max(50)
    .default([])
    .meta({
      deprecated: true,
      description: '已弃用；仅保留已有外部提供商工作流变量，清空后不允许重新配置'
    })
});

export const ProvidersConfigSchema = ProvidersConfigBaseSchema.superRefine((providers, ctx) => {
  const { documentParse } = providers;

  if (
    (documentParse.provider === 'customPdf' || documentParse.provider === 'custom') &&
    !documentParse.customPdf.url
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['documentParse', 'customPdf', 'url'],
      message: 'url is required when custom PDF parsing is selected'
    });
  }

  if (documentParse.provider === 'sangfor' && !documentParse.sangfor.url) {
    ctx.addIssue({
      code: 'custom',
      path: ['documentParse', 'sangfor', 'url'],
      message: 'url is required when Sangfor parsing is selected'
    });
  }
});
