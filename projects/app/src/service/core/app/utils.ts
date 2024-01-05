import { AppSimpleEditConfigTemplateType } from '@fastgpt/global/core/app/type';
import { GET } from '@fastgpt/service/common/api/plusRequest';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';

export async function getSimpleTemplatesFromPlus(): Promise<AppSimpleEditConfigTemplateType[]> {
  try {
    if (!FastGPTProUrl) return [];

    return GET<AppSimpleEditConfigTemplateType[]>('/core/app/getSimpleTemplates');
  } catch (error) {
    return [];
  }
}
