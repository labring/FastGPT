import z from 'zod';
import { textWithDefault, urlWithDefault } from './primitives';

export const SiteConfigSchema = z.strictObject({
  name: z.string().min(1).max(100).default('AI'),
  description: z.string().max(1000).default(''),
  favicon: textWithDefault(),
  chineseRedirectUrl: urlWithDefault(),
  marketplaceUrl: urlWithDefault('https://v2.marketplace.fastgpt.cn'),
  docUrl: urlWithDefault('https://doc.fastgpt.io'),
  openApiDocUrl: urlWithDefault('https://doc.fastgpt.io/openapi/intro'),
  systemTitle: z.string().min(1).max(100).default('FastGPT')
});
