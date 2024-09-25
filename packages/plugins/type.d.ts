import { PluginTemplateType } from '@fastgpt/global/core/plugin/type.d';
import { SystemPluginTemplateItemType } from '@fastgpt/global/core/workflow/type';

export type SystemPluginResponseType = Promise<Record<string, any>>;

declare global {
  var systemPlugins: SystemPluginTemplateItemType[];
  var systemPluginCb: Record<string, (e: any) => SystemPluginResponseType>;
}
