import { DELETE, GET, POST, PUT } from '@/web/admin/common/request';
import type { AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import type { WorkflowTemplateBasicType } from '@fastgpt/global/core/workflow/type';

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

/**
 * 模板列表与类型列表的契约都是数组，但 pro 服务不可用时请求层会降级为空分页结构（对象）。
 * 在 API 边界收敛为数组，调用方（模板管理页）无需重复判断降级形态。
 */
export const getSystemTemplates = async () => {
  const res = await GET<AppTemplateSchemaType[]>('/proApi/admin/app/templates/list');
  return Array.isArray(res) ? res : [];
};

export const postCreateTemplate = (data: AdminCreateTemplateBodyType) =>
  POST('/proApi/admin/app/templates/create', data);

/** 更新模板入参（原 pro/admin updateTemplateBody：AppTemplateSchema 部分字段 + 必填 templateId） */
export type AdminUpdateTemplateBodyType = Partial<AppTemplateSchemaType> & {
  templateId: string;
};

export const putUpdateTemplate = (data: AdminUpdateTemplateBodyType) =>
  PUT('/proApi/admin/app/templates/update', data);

export const delTemplate = (data: { id: string }) =>
  DELETE('/proApi/admin/app/templates/delete', data);

export const putUpdateQuickTemplate = (data: { templateIds: string[] }) =>
  PUT('/proApi/admin/app/templates/updateQuickTemplate', data);

export const putUpdateTemplateOrder = (data: {
  templates: { templateId: string; order: number }[];
}) => PUT('/proApi/admin/app/templates/updateOrder', data);

export const postSaveTemplateType = (data: {
  typeId: string;
  typeName: string;
  typeOrder: number;
}) => POST('/proApi/admin/app/templateType/save', data);

export const delTemplateType = (data: { typeId: string }) =>
  DELETE('/proApi/admin/app/templateType/delete', data);

export const putUpdateTemplateTypeOrder = (data: {
  types: { typeId: string; typeOrder: number }[];
}) => PUT('/proApi/admin/app/templateType/updateOrder', data);
