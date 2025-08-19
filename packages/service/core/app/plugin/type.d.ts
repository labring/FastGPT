import { SystemPluginListItemType } from '@fastgpt/global/core/app/type';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { WorkflowTemplateBasicType } from '@fastgpt/global/core/workflow/type';
import type { InputConfigType } from '@fastgpt/global/core/workflow/type/io';

export type SystemPluginConfigSchemaType = {
  pluginId: string;

  originCost: number; // n points/one time
  currentCost: number;
  hasTokenFee: boolean;
  isActive: boolean;
  pluginOrder?: number;
  systemKeyCost?: number;

  customConfig?: {
    name: string;
    avatar: string;
    intro?: string;
    toolDescription?: string;
    version: string;
    weight?: number;
    templateType: string;
    associatedPluginId: string;
    userGuide: string;
    author?: string;
  };
  inputListVal?: Record<string, any>;

  // @deprecated
  inputConfig?: {
    // Render config input form. Find the corresponding node and replace the variable directly
    key: string;
    label: string;
    description: string;
    value?: string;
  }[];
};

export type TGroupType = {
  typeName: string;
  typeId: string;
};

export type PluginGroupSchemaType = {
  groupId: string;
  groupAvatar: string;
  groupName: string;
  groupTypes: TGroupType[];
  groupOrder: number;
};
