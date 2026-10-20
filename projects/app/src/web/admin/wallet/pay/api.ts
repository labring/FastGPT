import { POST } from '@/web/admin/common/request';
import type {
  GetPaysBodyType,
  GetPaysResponseType
} from '@fastgpt/global/openapi/admin/wallet/pay/api';

export const getPays = (data: GetPaysBodyType) =>
  POST<GetPaysResponseType>('/proApi/admin/wallet/pay/getPays', data);
