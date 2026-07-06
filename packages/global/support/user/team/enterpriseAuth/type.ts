import z from 'zod';

export const EnterpriseAuthInfoSchema = z.object({
  enterpriseName: z.string(),
  unifiedCreditCode: z.string(),
  legalPersonName: z.string(),
  bankName: z.string(),
  bankAccount: z.string(),
  contactName: z.string(),
  contactTitle: z.string(),
  contactPhone: z.string(),
  demand: z.string()
});
export type EnterpriseAuthInfoType = z.infer<typeof EnterpriseAuthInfoSchema>;
