import z from 'zod';
import { positiveInteger, textWithDefault, urlWithDefault } from './primitives';

const CensorConfigSchema = z.strictObject({
  baiduClientId: textWithDefault(),
  baiduClientSecret: textWithDefault(),
  customCensorUrl: urlWithDefault()
});

const WorkflowHttpNodeSecuritySchema = z.strictObject({
  ignoreHttpsCertificate: z.boolean().default(false)
});

export const SecurityConfigSchema = z.strictObject({
  checkInternalIp: z.boolean().default(false),
  csrfEnabled: z.boolean().default(true),
  passwordLoginMinuteLimitCount: positiveInteger(10),
  maxLoginSession: positiveInteger(10),
  // 旧 ENV 未限制来源数量；迁移时不能因数量上限清空名单并回落为允许所有来源。
  allowedOrigins: z.array(z.string().min(1).max(2048)).default([]),
  skipFileTypeCheck: z.boolean().default(false),
  checkExternalFile: z.boolean().default(false),
  censor: CensorConfigSchema.prefault({}),
  workflowHttpNode: WorkflowHttpNodeSecuritySchema.prefault({}),
  // 旧名单没有条数上限；限制条数会让迁移净化器删除整个名单并关闭外链校验。
  // 保留逐项格式校验，避免升级后丢失既有访问限制。
  fileUrlWhitelist: z.array(z.string().min(1).max(2048)).default([])
});
