import { WorkflowTemplateBasicType } from '@fastgpt/global/core/workflow/type';

export type AppTemplateSchemaType = {
  templateId: string;
  name: string;
  intro: string;
  avatar: string;
  tags: string[];
  type: string;
  author?: string;
  isActive?: boolean;
  userGuide?: {
    type: 'markdown' | 'link';
    content: string;
  };
  isQuickTemplate?: boolean;
  order?: number;
  workflow: WorkflowTemplateBasicType;
};

export type TemplateTypeSchemaType = {
  typeName: string;
  typeId: string;
  typeOrder: number;
};
