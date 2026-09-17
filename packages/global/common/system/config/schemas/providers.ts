import z from 'zod';
import { positiveInteger, textWithDefault, urlWithDefault } from './primitives';

const DocumentParseProviderConfigSchema = z.strictObject({
  provider: z.enum(['none', 'customPdf', 'sangfor']).default('none'),
  customPdf: z
    .object({
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
    .object({
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

export const ProvidersConfigSchema = z.strictObject({
  documentParse: DocumentParseProviderConfigSchema.prefault({}),
  chunk: ChunkProviderConfigSchema.prefault({}),
  crm: CrmProviderConfigSchema.prefault({}),
  dataSource: DataSourceProviderConfigSchema.prefault({})
});
