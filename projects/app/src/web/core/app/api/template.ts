import { GET } from '@/web/common/api/request';
import {
  TemplateMarketItemType,
  TemplateMarketListItemType
} from '@fastgpt/global/core/workflow/type';

export const getTemplateMarketItemList = () =>
  GET<TemplateMarketListItemType[]>('/core/app/template/list');

export const getTemplateMarketItemDetail = (data: { templateId: string }) =>
  GET<TemplateMarketItemType>(`/core/app/template/detail`, data);
