import { GET } from '@/web/common/api/request';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  AppTemplateSchemaType,
  TemplateTypeSchemaType
} from '@fastgpt/service/core/app/templates/type';
import { defaultTemplateTypes } from '@fastgpt/web/core/workflow/constants';

export const getTemplateMarketItemList = () =>
  GET<AppTemplateSchemaType[]>('/core/app/template/list');

export const getTemplateTagList = () => {
  return useSystemStore.getState()?.feConfigs?.isPlus
    ? GET<TemplateTypeSchemaType[]>('/proApi/core/app/template/getTemplateTypes')
    : Promise.resolve(defaultTemplateTypes);
};
