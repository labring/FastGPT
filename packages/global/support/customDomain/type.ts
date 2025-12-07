import z from 'zod';

export const CustomDomainStatusEnum = z.enum([
  'active', // confirm to active
  'inactive' // scheduled task find DNS Resolve is down
]);

export const ProviderEnum = z.enum(['aliyun', 'tencent', 'volcengine']);
export const VerifyFileType = z.object({
  path: z.string(),
  content: z.string()
});
export const CustomDomainType = z.object({
  teamId: z.string(),
  domain: z.string(),
  cnameDomain: z.string(),
  status: CustomDomainStatusEnum,
  verifyFile: VerifyFileType.optional(),
  provider: ProviderEnum
});

export type VerifyFileType = z.infer<typeof VerifyFileType>;
export type CustomDomainType = z.infer<typeof CustomDomainType>;

export type CreateCustomDomainBody = {
  domain: string;
  provider: ProviderEnum;
  cnameDomain: string;
};
export type ProviderEnum = z.infer<typeof ProviderEnum>;
export type CustomDomainStatusEnum = z.infer<typeof CustomDomainStatusEnum>;

export type UpdateDomainVerifyFileBody = {
  domain: string;
  path: string;
  content: string;
};
