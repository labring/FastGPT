import { beforeEach, describe, expect, it, vi } from 'vitest';

const { axiosPostMock } = vi.hoisted(() => ({
  axiosPostMock: vi.fn()
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  axios: {
    get: vi.fn(),
    post: axiosPostMock
  }
}));

const validTransferBody = {
  enterpriseName: '示例科技有限公司',
  unifiedCreditCode: '91310000MA1K000000',
  legalPersonName: '张三',
  bankName: '中国工商银行',
  bankAccount: '6222000000000000'
};

const importTransferClient = async () => {
  vi.resetModules();
  process.env.ENTERPRISE_AUTH_SERVICE_URL = 'http://enterprise-auth.test';
  return import('@fastgpt/service/support/user/team/enterpriseAuth/transferClient');
};

describe('createEnterpriseAuthTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('交易失败但缺少上游响应码时按认证服务异常处理', async () => {
    const { createEnterpriseAuthTransfer } = await importTransferClient();
    axiosPostMock.mockResolvedValueOnce({
      data: {
        success: true,
        message: '认证服务处理失败',
        data: {
          isTransactionSuccess: false,
          respMsg: '内部服务异常'
        }
      }
    });

    const result = await createEnterpriseAuthTransfer(validTransferBody);

    expect(result).toEqual({
      type: 'service_failed',
      message: '内部服务异常'
    });
  });

  it('交易失败且带上游响应码时仍按企业信息错误处理', async () => {
    const { createEnterpriseAuthTransfer } = await importTransferClient();
    axiosPostMock.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          isTransactionSuccess: false,
          respCode: 'INFO_ERROR',
          respMsg: '企业信息不匹配'
        }
      }
    });

    const result = await createEnterpriseAuthTransfer(validTransferBody);

    expect(result).toEqual({
      type: 'info_failed',
      message: '企业信息不匹配',
      transferRespCode: 'INFO_ERROR',
      transferRespMsg: '企业信息不匹配'
    });
  });
});
