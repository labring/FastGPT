import z from 'zod';
import { ApiKeyTypeEnum } from './constants';

export const ApiKeyTypeSchema = z.enum(ApiKeyTypeEnum).meta({
  description: '密钥类型：personal 为个人凭证，app 为绑定应用的对话凭证',
  example: ApiKeyTypeEnum.personal
});

export const ApiKeyScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal(ApiKeyTypeEnum.personal), appId: z.never().optional() }),
  z.object({ type: z.literal(ApiKeyTypeEnum.app), appId: z.string().regex(/^[0-9a-fA-F]{24}$/) })
]);
export type ApiKeyScope = z.infer<typeof ApiKeyScopeSchema>;

/** 审计只记录凭证元信息，禁止包含明文 Key。交接沿用更新事件并记录前后归属。 */
export type ApiKeyAuditParams = {
  name?: string;
  keyName: string;
  keyId?: string;
  keyType?: ApiKeyTypeEnum;
  appId?: string;
  fromTmbId?: string;
  toTmbId?: string;
};
