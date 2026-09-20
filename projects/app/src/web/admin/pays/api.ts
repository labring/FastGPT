import { POST } from '@/web/admin/common/request';
import type {
  GetPaysBodyType,
  GetPaysResponseType
} from '@fastgpt/global/openapi/admin/routes/pays/api';

export const getPays = (data: GetPaysBodyType) =>
  POST<GetPaysResponseType>('/proApi/admin/routes/pays/getPays', data);
