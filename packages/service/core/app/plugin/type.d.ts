import { SystemPluginTemplateItemType } from '@fastgpt/global/core/workflow/type';

export type SystemPluginConfigSchemaType = {
  pluginId: string;

  originCost: number; // n points/one time
  currentCost: number;
  isActive: boolean;
  inputConfig: SystemPluginTemplateItemType['inputConfig'];
};
