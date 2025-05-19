import { PluginTemplateType } from '@fastgpt/global/core/plugin/type.d';
import { systemPluginResponseEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { SystemPluginTemplateItemType } from '@fastgpt/global/core/workflow/type';
import { PluginGroupSchemaType } from '@fastgpt/service/core/app/plugin/type';

export type SystemPluginResponseType = Promise<Record<string, any>>;
export type SystemPluginSpecialResponse = {
  type: 'SYSTEM_PLUGIN_BASE64';
  value: string;
  extension: string;
};

declare global {
  var pluginGroups: PluginGroupSchemaType[];
  var systemPlugins: SystemPluginTemplateItemType[];
  var systemPluginCb: Record<string, (e: any) => SystemPluginResponseType>;
}
