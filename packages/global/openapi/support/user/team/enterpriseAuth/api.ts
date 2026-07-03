import z from 'zod';
import {
  EnterpriseAuthAmountMaxErrorTimes,
  EnterpriseAuthMaxTimes,
  TeamEnterpriseAuthStatusSchema,
  TeamEnterpriseAuthTaskStatusSchema
} from '../../../../../support/user/team/enterpriseAuth/constant';
import {
  isBankAccount,
  isUnifiedCreditCode,
  normalizeBankAccount,
  normalizeUnifiedCreditCode
} from '../../../../../support/user/team/enterpriseAuth/utils';

/* ============================================================================
 * API: 获取企业认证状态
 * Route: GET /api/proApi/support/user/team/enterpriseAuth/status
 * Method: GET
 * Description: 获取当前团队企业认证入口开关、认证状态和可恢复任务信息
 * Tags: ['团队管理']
 * ============================================================================ */

export const EnterpriseAuthLightTaskSchema = z.object({
  taskId: z.string().meta({ description: '认证任务 ID' }),
  status: TeamEnterpriseAuthTaskStatusSchema.meta({ description: '当前任务状态' }),
  amountErrorTimes: z.number().int().meta({
    description: '当前任务金额填写错误次数',
    example: 0
  })
});

export const GetEnterpriseAuthStatusResponseSchema = z.object({
  enabled: z.boolean().meta({ description: '企业认证入口是否开启' }),
  status: TeamEnterpriseAuthStatusSchema.optional().meta({ description: '团队认证状态' }),
  usedTimes: z
    .number()
    .int()
    .optional()
    .meta({ description: `已使用认证次数，最多 ${EnterpriseAuthMaxTimes} 次`, example: 0 }),
  canManage: z.boolean().optional().meta({ description: '当前成员是否可管理企业认证' }),
  verifiedEnterpriseName: z.string().optional().meta({ description: '认证通过企业名称' }),
  currentTask: EnterpriseAuthLightTaskSchema.optional().meta({
    description: '未完成认证任务'
  }),
  lastErrorCode: z.string().optional().meta({ description: '最近一次失败错误码' }),
  lastErrorMessage: z.string().optional().meta({ description: '最近一次失败提示' })
});
export type GetEnterpriseAuthStatusResponseType = z.infer<
  typeof GetEnterpriseAuthStatusResponseSchema
>;

/* ============================================================================
 * API: 获取当前企业认证任务详情
 * Route: GET /api/proApi/support/user/team/enterpriseAuth/currentTaskDetail
 * Method: GET
 * Description: 获取待金额验证任务的完整展示信息，不返回验证金额
 * Tags: ['团队管理']
 * ============================================================================ */

export const GetEnterpriseAuthCurrentTaskDetailResponseSchema = z.object({
  taskId: z.string().meta({ description: '认证任务 ID' }),
  status: TeamEnterpriseAuthTaskStatusSchema.meta({ description: '当前任务状态' }),
  enterpriseName: z.string().meta({ description: '企业名称' }),
  unifiedCreditCode: z.string().meta({ description: '统一社会信用代码' }),
  legalPersonName: z.string().meta({ description: '法人姓名' }),
  bankName: z.string().meta({ description: '开户银行名称' }),
  bankAccount: z.string().meta({ description: '企业银行账号，仅此接口返回完整值' }),
  contactName: z.string().meta({ description: '联系人姓名' }),
  contactTitle: z.string().meta({ description: '联系人职位' }),
  contactPhone: z.string().meta({ description: '联系人手机号' }),
  demand: z.string().meta({ description: '需求描述' }),
  amountErrorTimes: z.number().int().meta({ description: '金额错误次数' })
});
export type GetEnterpriseAuthCurrentTaskDetailResponseType = z.infer<
  typeof GetEnterpriseAuthCurrentTaskDetailResponseSchema
>;

/* ============================================================================
 * API: 获取企业认证银行列表
 * Route: GET /api/proApi/support/user/team/enterpriseAuth/banks
 * Method: GET
 * Description: 从小额汇款服务获取银行编码到总行名称映射
 * Tags: ['团队管理']
 * ============================================================================ */

export const GetEnterpriseAuthBanksResponseSchema = z.record(z.string(), z.string()).meta({
  description: '银行简称到银行公司全称的映射'
});
export type GetEnterpriseAuthBanksResponseType = z.infer<
  typeof GetEnterpriseAuthBanksResponseSchema
>;

const EnterpriseAuthRequiredStringSchema = z.string().trim().min(1);
const BankAccountSchema = EnterpriseAuthRequiredStringSchema.transform((account) =>
  normalizeBankAccount(account)
)
  .pipe(z.string().refine(isBankAccount))
  .meta({
    description: '企业银行账号，15-19 位数字，可输入空格分隔',
    example: '4111111111111111'
  });
const UnifiedCreditCodeSchema = EnterpriseAuthRequiredStringSchema.transform((code) =>
  normalizeUnifiedCreditCode(code)
)
  .pipe(z.string().refine(isUnifiedCreditCode))
  .meta({
    description:
      '统一社会信用代码，18 位大写数字或字母（不包含 I/O/S/V/Z），需通过 GB 32100-2015 校验码校验',
    example: '91310000MA1K000006'
  });
const VerifyEnterpriseAuthAmountCentSchema = z.number().int().positive();

export const StartEnterpriseAuthBodySchema = z.object({
  enterpriseName: EnterpriseAuthRequiredStringSchema.max(100).meta({
    description: '企业全称，需与银行开户名一致',
    example: '示例科技有限公司'
  }),
  unifiedCreditCode: UnifiedCreditCodeSchema,
  legalPersonName: EnterpriseAuthRequiredStringSchema.max(50).meta({
    description: '法人姓名',
    example: '张三'
  }),
  bankAccount: BankAccountSchema,
  bankName: EnterpriseAuthRequiredStringSchema.max(80).meta({
    description: '开户银行名称',
    example: '中国工商银行'
  }),
  contactName: EnterpriseAuthRequiredStringSchema.max(50).meta({
    description: '联系人姓名',
    example: '李四'
  }),
  contactTitle: EnterpriseAuthRequiredStringSchema.max(50).meta({
    description: '联系人职位',
    example: '产品负责人'
  }),
  contactPhone: EnterpriseAuthRequiredStringSchema.max(30).meta({
    description: '联系人手机号',
    example: '13800000000'
  }),
  demand: EnterpriseAuthRequiredStringSchema.max(500).meta({
    description: '使用需求描述',
    example: '希望了解企业知识库和工作流能力'
  })
});
export type StartEnterpriseAuthBodyType = z.infer<typeof StartEnterpriseAuthBodySchema>;

/* ============================================================================
 * API: 发起企业认证
 * Route: POST /api/proApi/support/user/team/enterpriseAuth/start
 * Method: POST
 * Description: 创建小额汇款认证任务，打款成功后返回待金额验证任务
 * Tags: ['团队管理']
 * ============================================================================ */

export const StartEnterpriseAuthResponseSchema = z.object({
  status: TeamEnterpriseAuthStatusSchema.meta({ description: '团队认证状态' }),
  currentTask: EnterpriseAuthLightTaskSchema.optional().meta({
    description: '未完成认证任务；仅 pending_amount/amount_failed 可进入金额验证页'
  }),
  usedTimes: z
    .number()
    .int()
    .meta({ description: `已使用认证次数，最多 ${EnterpriseAuthMaxTimes} 次` }),
  message: z.string().optional().meta({ description: '流程提示' })
});
export type StartEnterpriseAuthResponseType = z.infer<typeof StartEnterpriseAuthResponseSchema>;

export const VerifyEnterpriseAuthAmountBodySchema = z.object({
  taskId: z.string().min(1).meta({ description: '认证任务 ID' }),
  amountCent: VerifyEnterpriseAuthAmountCentSchema.meta({
    description: '用户填写的到账金额，单位为分',
    example: 123
  })
});
export type VerifyEnterpriseAuthAmountBodyType = z.infer<
  typeof VerifyEnterpriseAuthAmountBodySchema
>;

/* ============================================================================
 * API: 验证企业认证打款金额
 * Route: POST /api/proApi/support/user/team/enterpriseAuth/verifyAmount
 * Method: POST
 * Description: 校验到账金额并在成功后发放企业认证赠送权益
 * Tags: ['团队管理']
 * ============================================================================ */

export const VerifyEnterpriseAuthAmountResponseSchema = z.object({
  status: TeamEnterpriseAuthStatusSchema.meta({ description: '团队认证状态' }),
  verifiedEnterpriseName: z.string().optional().meta({ description: '认证通过企业名称' }),
  amountMaxErrorTimes: z.literal(EnterpriseAuthAmountMaxErrorTimes).meta({
    description: '金额最大错误次数'
  })
});
export type VerifyEnterpriseAuthAmountResponseType = z.infer<
  typeof VerifyEnterpriseAuthAmountResponseSchema
>;

/* ============================================================================
 * API: 重置企业认证待金额验证任务
 * Route: POST /api/proApi/support/user/team/enterpriseAuth/reset
 * Method: POST
 * Description: 用户确认信息有误后取消当前待金额验证任务
 * Tags: ['团队管理']
 * ============================================================================ */

export const ResetEnterpriseAuthResponseSchema = z.undefined().meta({ description: '操作成功' });
export type ResetEnterpriseAuthResponseType = z.infer<typeof ResetEnterpriseAuthResponseSchema>;
