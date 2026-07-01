import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { TeamEnterpriseAuthTaskStatusEnum } from './constant';

export const EnterpriseAuthTaskSchema = z.object({
  _id: ObjectIdSchema,
  teamId: ObjectIdSchema,
  userId: ObjectIdSchema.optional(),
  tmbId: ObjectIdSchema.optional(),
  taskId: z.string(),
  status: z.enum(TeamEnterpriseAuthTaskStatusEnum),
  enterpriseName: z.string(),
  unifiedCreditCode: z.string(),
  legalPersonName: z.string(),
  bankName: z.string(),
  bankAccount: z.string(),
  contactName: z.string(),
  contactTitle: z.string(),
  contactPhone: z.string(),
  demand: z.string(),
  orderId: z.string().optional(),
  transferAmountCent: z.number().int().optional(),
  transferRespCode: z.string().optional(),
  transferRespMsg: z.string().optional(),
  grantExpiredAt: z.date().optional(),
  amountErrorTimes: z.number().int(),
  usedTimes: z.number().int(),
  lastErrorCode: z.string().optional(),
  lastErrorMessage: z.string().optional(),
  startedAt: z.date(),
  expireAt: z.date().optional(),
  endedAt: z.date().optional(),
  createTime: z.date(),
  updateTime: z.date()
});
export type EnterpriseAuthTaskType = z.infer<typeof EnterpriseAuthTaskSchema>;

export const TeamEnterpriseAuthSchema = z.object({
  _id: ObjectIdSchema,
  teamId: ObjectIdSchema,
  enterpriseName: z.string(),
  unifiedCreditCode: z.string(),
  legalPersonName: z.string(),
  bankName: z.string(),
  bankAccount: z.string(),
  contactName: z.string(),
  contactTitle: z.string(),
  contactPhone: z.string(),
  demand: z.string(),
  verifiedAt: z.date(),
  createTime: z.date(),
  updateTime: z.date()
});
export type TeamEnterpriseAuthType = z.infer<typeof TeamEnterpriseAuthSchema>;
