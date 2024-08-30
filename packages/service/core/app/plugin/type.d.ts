import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  SystemPluginTemplateItemType,
  WorkflowTemplateBasicType
} from '@fastgpt/global/core/workflow/type';

export type SystemPluginConfigSchemaType = {
  pluginId: string;

  originCost: number; // n points/one time
  currentCost: number;
  isActive: boolean;
  inputConfig: SystemPluginTemplateItemType['inputConfig'];

  customConfig?: {
    name: string;
    avatar: string;
    intro?: string;
    version: string;
    weight?: number;
    workflow: WorkflowTemplateBasicType;
    templateType: FlowNodeTemplateTypeEnum;
  };
};
