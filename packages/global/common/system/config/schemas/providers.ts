import z from 'zod';
import { textWithDefault, urlWithDefault } from './primitives';

const DocumentParseProviderConfigSchema = z.strictObject({
  provider: z
    .enum(['none', 'customPdf', 'custom', 'somark', 'doc2x', 'textin', 'textln', 'sangfor'])
    .default('none'),
  customPdf: z
    .strictObject({
      url: urlWithDefault(),
      key: textWithDefault(),
      somarkApiKey: textWithDefault(),
      doc2xKey: textWithDefault(),
      textinAppId: textWithDefault(),
      textinSecretCode: textWithDefault()
    })
    .prefault({
      url: '',
      key: '',
      somarkApiKey: '',
      doc2xKey: '',
      textinAppId: '',
      textinSecretCode: ''
    }),
  sangfor: z
    .strictObject({
      url: urlWithDefault(),
      key: textWithDefault(),
      extensions: z.string().default('pdf'),
      timeoutSeconds: z.number().int().min(1).max(7200).default(600)
    })
    .prefault({ url: '', key: '', extensions: 'pdf', timeoutSeconds: 600 })
});

const DataSourceProviderConfigSchema = z.strictObject({
  feishuBaseUrl: urlWithDefault('https://open.feishu.cn'),
  dingtalkBaseUrl: urlWithDefault('https://api.dingtalk.com'),
  dingtalkOapiBaseUrl: urlWithDefault('https://oapi.dingtalk.com'),
  yuqueDatasetBaseUrl: urlWithDefault('https://www.yuque.com')
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
  dataSource: DataSourceProviderConfigSchema.prefault({}),
  externalProviderWorkflowVariables: z
    .array(ExternalProviderWorkflowVarConfigSchema)
    .max(50)
    .default([])
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
