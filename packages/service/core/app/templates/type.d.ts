import { WorkflowTemplateBasicType } from '@fastgpt/global/core/workflow/type';

export type SystemTemplateSchemaType = {
  templateId: string;
  name: string;
  intro: string;
  avatar: string;
  tags: string[];
  type: AppTypeEnum;
  isActive: boolean;
  userGuide: {
    type: 'markdown' | 'link';
    content: string;
  };
  workflow: string;
};
