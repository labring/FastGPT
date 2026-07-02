import { GET, POST } from '@/web/common/api/request';
import type {
  GetEnterpriseAuthBanksResponseType,
  GetEnterpriseAuthCurrentTaskDetailResponseType,
  GetEnterpriseAuthStatusResponseType,
  StartEnterpriseAuthBodyType,
  StartEnterpriseAuthResponseType,
  VerifyEnterpriseAuthAmountBodyType,
  VerifyEnterpriseAuthAmountResponseType
} from '@fastgpt/global/openapi/support/user/team/enterpriseAuth/api';

const baseUrl = '/proApi/support/user/team/enterpriseAuth';

export const getEnterpriseAuthStatus = () =>
  GET<GetEnterpriseAuthStatusResponseType>(`${baseUrl}/status`);

export const getEnterpriseAuthCurrentTaskDetail = () =>
  GET<GetEnterpriseAuthCurrentTaskDetailResponseType>(`${baseUrl}/currentTaskDetail`);

export const getEnterpriseAuthBanks = () =>
  GET<GetEnterpriseAuthBanksResponseType>(`${baseUrl}/banks`);

export const startEnterpriseAuth = (data: StartEnterpriseAuthBodyType) =>
  POST<StartEnterpriseAuthResponseType>(`${baseUrl}/start`, data);

export const verifyEnterpriseAuthAmount = (data: VerifyEnterpriseAuthAmountBodyType) =>
  POST<VerifyEnterpriseAuthAmountResponseType>(`${baseUrl}/verifyAmount`, data);

export const resetEnterpriseAuthTask = () => POST(`${baseUrl}/reset`);
