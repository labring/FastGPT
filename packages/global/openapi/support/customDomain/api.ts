import { z } from 'zod';
import { CustomDomainType, ProviderEnum } from '../../../support/customDomain/type';

// Create custom domain
export const CreateCustomDomainBodySchema = z.object({
  domain: z.string().meta({ example: 'chat.example.com', description: '自定义域名' }),
  provider: ProviderEnum.meta({
    example: 'aliyun',
    description: 'DNS 提供商：aliyun, tencent, volcengine'
  }),
  cnameDomain: z.string().meta({ example: 'lb.example.com', description: 'CNAME 目标域名' })
});
export type CreateCustomDomainBodyType = z.infer<typeof CreateCustomDomainBodySchema>;

export const CreateCustomDomainResponseSchema = z.object({
  success: z.boolean().meta({ example: true, description: '创建是否成功' })
});
export type CreateCustomDomainResponseType = z.infer<typeof CreateCustomDomainResponseSchema>;

// List custom domains
export const CustomDomainListResponseSchema = z.array(
  CustomDomainType.extend({
    _id: z
      .string()
      .optional()
      .meta({ example: '68ad85a7463006c963799a05', description: '域名记录 ID' })
  })
);
export type CustomDomainListResponseType = z.infer<typeof CustomDomainListResponseSchema>;

// Delete custom domain
export const DeleteCustomDomainQuerySchema = z.object({
  domain: z.string().meta({ example: 'chat.example.com', description: '要删除的域名' })
});
export type DeleteCustomDomainQueryType = z.infer<typeof DeleteCustomDomainQuerySchema>;

export const DeleteCustomDomainResponseSchema = z.object({
  success: z.boolean().meta({ example: true, description: '删除是否成功' })
});
export type DeleteCustomDomainResponseType = z.infer<typeof DeleteCustomDomainResponseSchema>;

// Check DNS resolve
export const CheckDNSResolveBodySchema = z.object({
  domain: z.string().meta({ example: 'chat.example.com', description: '要检查的域名' }),
  cnameDomain: z.string().meta({ example: 'lb.example.com', description: 'CNAME 目标域名' })
});
export type CheckDNSResolveBodyType = z.infer<typeof CheckDNSResolveBodySchema>;

export const CheckDNSResolveResponseSchema = z.object({
  success: z.boolean().meta({ example: true, description: 'DNS 解析是否成功' }),
  message: z
    .string()
    .optional()
    .meta({ example: 'CNAME record not resolved', description: '错误信息' })
});
export type CheckDNSResolveResponseType = z.infer<typeof CheckDNSResolveResponseSchema>;

// Active custom domain
export const ActiveCustomDomainBodySchema = z.object({
  domain: z.string().meta({ example: 'chat.example.com', description: '要激活的域名' })
});
export type ActiveCustomDomainBodyType = z.infer<typeof ActiveCustomDomainBodySchema>;

export const ActiveCustomDomainResponseSchema = z.object({
  success: z.boolean().meta({ example: true, description: '激活是否成功' })
});
export type ActiveCustomDomainResponseType = z.infer<typeof ActiveCustomDomainResponseSchema>;

// Update domain verify file
export const UpdateDomainVerifyFileBodySchema = z.object({
  domain: z.string().meta({ example: 'chat.example.com', description: '域名' }),
  path: z
    .string()
    .meta({ example: '/.well-known/pki-validation/fileauth.txt', description: '验证文件路径' }),
  content: z.string().meta({ example: '202312121234567890abcdef', description: '验证文件内容' })
});
export type UpdateDomainVerifyFileBodyType = z.infer<typeof UpdateDomainVerifyFileBodySchema>;

export const UpdateDomainVerifyFileResponseSchema = z.object({
  success: z.boolean().meta({ example: true, description: '更新是否成功' })
});
export type UpdateDomainVerifyFileResponseType = z.infer<
  typeof UpdateDomainVerifyFileResponseSchema
>;
