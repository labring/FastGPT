import type { ListParams, ListResponse } from '@/pages/api/core/app/template/list';
import { GET, POST } from '@/web/common/api/request';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { AppTemplateSchemaType, TemplateTypeSchemaType } from '@fastgpt/global/core/app/type';
import { defaultTemplateTypes } from '@fastgpt/web/core/workflow/constants';

export const getTemplateMarketItemList = (data: ListParams) =>
  GET<ListResponse>(`/core/app/template/list`, data);

export const getTemplateMarketItemDetail = (templateId: string) =>
  GET<AppTemplateSchemaType>(`/core/app/template/detail?templateId=${templateId}`);

export const getTemplateTagList = () => {
  return useSystemStore.getState()?.feConfigs?.isPlus
    ? GET<TemplateTypeSchemaType[]>('/proApi/core/app/template/getTemplateTypes')
    : Promise.resolve(defaultTemplateTypes);
};
