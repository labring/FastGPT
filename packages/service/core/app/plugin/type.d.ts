import { SystemPluginListItemType } from '@fastgpt/global/core/app/type';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { WorkflowTemplateBasicType } from '@fastgpt/global/core/workflow/type';
import type { InputConfigType } from '@fastgpt/global/core/workflow/type/io';
import type { I18nStringStrictType } from '@fastgpt/global/sdk/fastgpt-plugin';

export type SystemPluginConfigSchemaType = {
  pluginId: string;

  originCost: number; // n points/one time
  currentCost: number;
  hasTokenFee: boolean;
  status?: number;
  defaultInstalled?: boolean;
  pluginOrder?: number;
  systemKeyCost?: number;

  customConfig?: {
    name: string;
    avatar: string;
    intro?: string;
    toolDescription?: string;
    version: string;
    weight?: number;
    pluginTags?: string[];
    associatedPluginId: string;
    userGuide: string;
    author?: string;

    // @deprecated
    templateType: string;
  };
  inputListVal?: Record<string, any>;

  // @deprecated
  isActive?: boolean;
  inputConfig?: {
    // Render config input form. Find the corresponding node and replace the variable directly
    key: string;
    label: string;
    description: string;
    value?: string;
  }[];
};

export type TGroupType = {
  typeName: I18nStringStrictType | string;
  typeId: string;
};

export type SystemToolGroupSchemaType = {
  groupId: string;
  groupAvatar: string;
  groupName: string;
  groupTypes: TGroupType[];
  groupOrder: number;
};

export type PluginTagSchemaType = {
  tagId: string;
  tagName: I18nStringStrictType | string;
  tagOrder: number;
  isSystem: boolean;
};

export type TeamInstalledPluginSchemaType = {
  _id: string;
  teamId: string;
  pluginId: string;
  installed: boolean;
  createTime: Date;
  updateTime: Date;
};
