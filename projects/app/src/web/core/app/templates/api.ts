import { GET } from '@/web/common/api/request';
import type { GetTemplateTypesResponseType } from '@fastgpt/global/openapi/core/app/template/api';

export const getTemplateTypes = async () => {
  const res = await GET<GetTemplateTypesResponseType>('/proApi/core/app/template/getTemplateTypes');
  return Array.isArray(res) ? res : [];
};
