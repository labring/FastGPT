import { GET } from '@/web/common/api/request';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { AppTemplateSchemaType, TemplateTypeSchemaType } from '@fastgpt/global/core/app/type';
import { defaultTemplateTypes } from '@fastgpt/web/core/workflow/constants';
import type {
  GetAppTemplateDetailQueryType,
  GetAppTemplateDetailResponseType,
  ListAppTemplateQueryType,
  ListAppTemplateResponseType
} from '@fastgpt/global/openapi/core/app/template/api';

export const getTemplateMarketItemList = (data: ListAppTemplateQueryType) =>
  GET<ListAppTemplateResponseType>(`/core/app/template/list`, data);

export const getTemplateMarketItemDetail = (
  templateId: GetAppTemplateDetailQueryType['templateId']
) =>
  GET<GetAppTemplateDetailResponseType>(`/core/app/template/detail?templateId=${templateId}`).then(
    (template): AppTemplateSchemaType => {
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      return template;
    }
  );

export const getTemplateTagList = () => {
  return useSystemStore.getState()?.feConfigs?.isPlus
    ? GET<TemplateTypeSchemaType[]>('/proApi/core/app/template/getTemplateTypes')
    : Promise.resolve(defaultTemplateTypes);
};
