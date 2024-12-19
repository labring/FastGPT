import { GET } from '@/web/common/api/request';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { TemplateMarketItemType } from '@fastgpt/global/core/workflow/type';
import {
  SystemTemplateSchemaType,
  TemplateTypeSchemaType
} from '@fastgpt/service/core/app/templates/type';
import { defaultTemplateTypes } from '@fastgpt/web/core/workflow/constants';

export const getTemplateMarketItemList = () =>
  GET<SystemTemplateSchemaType[]>('/core/app/template/list');

export const getTemplateMarketItemDetail = (data: { templateId: string }) =>
  GET<TemplateMarketItemType>(`/core/app/template/detail`, data);

export const getTemplateTagList = () => {
  return useSystemStore.getState()?.feConfigs?.isPlus
    ? GET<TemplateTypeSchemaType[]>('/proApi/core/app/template/getTemplateTypes')
    : Promise.resolve(defaultTemplateTypes);
};
