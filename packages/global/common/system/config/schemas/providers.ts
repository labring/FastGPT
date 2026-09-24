import z from 'zod';
import { positiveInteger, textWithDefault, urlWithDefault } from './primitives';

const DocumentParseProviderConfigSchema = z.strictObject({
  provider: z.enum(['none', 'customPdf', 'sangfor']).default('none'),
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

const ChunkProviderConfigSchema = z.strictObject({
  enabled: z.boolean().default(false),
  url: urlWithDefault(),
  key: textWithDefault(),
  timeoutMinutes: positiveInteger(60)
});

const CrmProviderConfigSchema = z.strictObject({
  enabled: z.boolean().default(false),
  apiUrl: urlWithDefault(),
  apiKey: textWithDefault()
});

const DataSourceProviderConfigSchema = z.strictObject({
  feishuBaseUrl: urlWithDefault('https://open.feishu.cn'),
  dingtalkBaseUrl: urlWithDefault('https://api.dingtalk.com'),
  dingtalkOapiBaseUrl: urlWithDefault('https://oapi.dingtalk.com'),
  yuqueDatasetBaseUrl: urlWithDefault('https://www.yuque.com')
});

export const ProvidersConfigBaseSchema = z.strictObject({
  documentParse: DocumentParseProviderConfigSchema.prefault({}),
  chunk: ChunkProviderConfigSchema.prefault({}),
  crm: CrmProviderConfigSchema.prefault({}),
  dataSource: DataSourceProviderConfigSchema.prefault({})
});

export const ProvidersConfigSchema = ProvidersConfigBaseSchema.superRefine((providers, ctx) => {
  const { chunk, crm, documentParse } = providers;

  if (chunk.enabled && (!chunk.url || !chunk.key.trim())) {
    ctx.addIssue({
      code: 'custom',
      path: ['chunk'],
      message: 'url and key are required when intelligent chunking is enabled'
    });
  }

  if (crm.enabled && (!crm.apiUrl || !crm.apiKey.trim())) {
    ctx.addIssue({
      code: 'custom',
      path: ['crm'],
      message: 'apiUrl and apiKey are required when CRM is enabled'
    });
  }

  if (documentParse.provider === 'customPdf' && !documentParse.customPdf.url) {
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
