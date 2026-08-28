import { DELETE, GET, POST, PUT } from '@/web/admin/common/request';
import type { AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import type { WorkflowTemplateBasicType } from '@fastgpt/global/core/workflow/type';
import type { GetTemplateTypesResponseType } from '@fastgpt/global/openapi/core/app/template/api';

/** 应用模板类型（原 pro/admin API 路由内联） */
export type AdminCreateTemplateBodyType = {
  name: string;
  intro: string;
  avatar: string;
  tags: string[];
  type: string;
  isActive?: boolean;
  isPromoted?: boolean;
  promoteTags?: string[];
  hideTags?: string[];
  recommendText?: string;
  userGuide?: {
    type: 'markdown' | 'link';
    content: string;
  };
  workflow: WorkflowTemplateBasicType;
};

export const getSystemTemplates = () =>
  GET<AppTemplateSchemaType[]>('/proApi/admin/core/app/templates/list');

export const postCreateTemplate = (data: AdminCreateTemplateBodyType) =>
  POST('/proApi/admin/core/app/templates/create', data);

/** 更新模板入参（原 pro/admin updateTemplateBody：AppTemplateSchema 部分字段 + 必填 templateId） */
export type AdminUpdateTemplateBodyType = Partial<AppTemplateSchemaType> & {
  templateId: string;
};

export const putUpdateTemplate = (data: AdminUpdateTemplateBodyType) =>
  PUT('/proApi/admin/core/app/templates/update', data);

export const delTemplate = (data: { id: string }) =>
  DELETE('/proApi/admin/core/app/templates/delete', data);

export const putUpdateQuickTemplate = (data: { templateIds: string[] }) =>
  PUT('/proApi/admin/core/app/templates/updateQuickTemplate', data);

export const putUpdateTemplateOrder = (data: {
  templates: { templateId: string; order: number }[];
}) => PUT('/proApi/admin/core/app/templates/updateOrder', data);

export const getTemplateTypes = () =>
  GET<GetTemplateTypesResponseType>('/proApi/core/app/template/getTemplateTypes');

export const postSaveTemplateType = (data: {
  typeId: string;
  typeName: string;
  typeOrder: number;
}) => POST('/proApi/admin/core/app/templateType/save', data);

export const delTemplateType = (data: { typeId: string }) =>
  DELETE('/proApi/admin/core/app/templateType/delete', data);

export const putUpdateTemplateTypeOrder = (data: {
  types: { typeId: string; typeOrder: number }[];
}) => PUT('/proApi/admin/core/app/templateType/updateOrder', data);
