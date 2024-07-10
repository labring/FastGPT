import { GET } from '@/web/common/api/request';
import { TemplateMarketItemType, TemplateMarketListType } from '@fastgpt/global/core/workflow/type';

export const getTemplateMarketItemList = () =>
  GET<TemplateMarketListType>('/core/app/template/getTemplateMarketList');

export const getTemplateMarketItemDetail = (data: { templateId: string }) =>
  GET<TemplateMarketItemType>(`/core/app/template/getTemplateMarketItemDetail`, data);
