import z from 'zod';
import { EnterpriseAuthErrEnum } from '@fastgpt/global/support/user/team/enterpriseAuth/constant';
import type { StartEnterpriseAuthBodyType } from '@fastgpt/global/openapi/support/user/team/enterpriseAuth/api';
import { serviceEnv } from '../../../../env';
import { axios } from '../../../../common/api/axios';

const BankListResponseSchema = z.object({
  success: z.literal(true),
  data: z.record(z.string(), z.string())
});

const EnterpriseAuthTransferResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      isTransactionSuccess: z.boolean(),
      orderId: z.string().optional(),
      transAmt: z.union([z.string(), z.number()]).optional(),
      respCode: z.string().optional(),
      respMsg: z.string().optional()
    })
    .optional(),
  message: z.string().optional()
});

export type EnterpriseAuthTransferResult =
  | {
      type: 'success';
      orderId?: string;
      transferAmountFen: number;
      transferRespCode?: string;
      transferRespMsg?: string;
    }
  | {
      type: 'info_failed';
      message?: string;
      transferRespCode?: string;
      transferRespMsg?: string;
    }
  | {
      type: 'service_failed' | 'timeout';
      message?: string;
    };

export const hasEnterpriseAuthServiceConfig = () => !!serviceEnv.ENTERPRISE_AUTH_SERVICE_URL;

const getEnterpriseAuthServiceConfig = () => {
  if (!hasEnterpriseAuthServiceConfig()) {
    throw new Error(EnterpriseAuthErrEnum.serviceNotConfigured);
  }

  return {
    baseURL: serviceEnv.ENTERPRISE_AUTH_SERVICE_URL,
    timeout: serviceEnv.ENTERPRISE_AUTH_SERVICE_TIMEOUT_MS,
    headers: {
      ...(serviceEnv.ENTERPRISE_AUTH_SERVICE_API_KEY && {
        'X-API-Key': serviceEnv.ENTERPRISE_AUTH_SERVICE_API_KEY
      }),
      'Content-Type': 'application/json'
    }
  };
};

export const getEnterpriseAuthBanks = async () => {
  const config = getEnterpriseAuthServiceConfig();
  const res = await axios.get('/v1/banks', config);
  return BankListResponseSchema.parse(res.data).data;
};

const parseFenAmount = (amount: string | number | undefined) => {
  if (amount === undefined || amount === '') return;
  const num = Number(amount);
  if (!Number.isInteger(num) || num <= 0) return;
  return num;
};

const parseFailedTransferResult = (
  result: z.infer<typeof EnterpriseAuthTransferResponseSchema>['data'],
  fallbackMessage?: string
): EnterpriseAuthTransferResult => {
  // 没有上游响应码时无法证明是企业信息校验失败，应按认证服务异常处理，避免误导用户反复修改表单。
  if (!result?.respCode) {
    return {
      type: 'service_failed',
      message: result?.respMsg || fallbackMessage
    };
  }

  return {
    type: 'info_failed',
    message: result.respMsg || fallbackMessage,
    transferRespCode: result.respCode,
    transferRespMsg: result.respMsg
  };
};

export const createEnterpriseAuthTransfer = async (
  data: Pick<
    StartEnterpriseAuthBodyType,
    'enterpriseName' | 'unifiedCreditCode' | 'legalPersonName' | 'bankName' | 'bankAccount'
  >
): Promise<EnterpriseAuthTransferResult> => {
  const config = getEnterpriseAuthServiceConfig();

  try {
    const res = await axios.post(
      '/v1/enterprise-auth',
      {
        key: data.unifiedCreditCode,
        accountBank: data.bankName,
        keyName: data.enterpriseName,
        usrName: data.legalPersonName,
        accountNo: data.bankAccount
      },
      config
    );

    const parsed = EnterpriseAuthTransferResponseSchema.safeParse(res.data);
    if (!parsed.success || !parsed.data.success || !parsed.data.data) {
      return {
        type: 'service_failed',
        message: parsed.success ? parsed.data.message : undefined
      };
    }

    const result = parsed.data.data;
    if (!result.isTransactionSuccess) {
      return parseFailedTransferResult(result, parsed.data.message);
    }

    const amountFen = parseFenAmount(result.transAmt);
    if (amountFen === undefined) {
      return {
        type: 'service_failed',
        message: 'Invalid transfer amount'
      };
    }

    return {
      type: 'success',
      orderId: result.orderId,
      transferAmountFen: amountFen,
      transferRespCode: result.respCode,
      transferRespMsg: result.respMsg
    };
  } catch (error: any) {
    if (error?.code === 'ECONNABORTED') {
      return {
        type: 'timeout',
        message: EnterpriseAuthErrEnum.serviceTimeout
      };
    }

    return {
      type: 'service_failed',
      message: error?.message
    };
  }
};
