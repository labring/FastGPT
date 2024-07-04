import { SystemPluginTemplateItemType } from '@fastgpt/global/core/workflow/type';
export type SystemPluginResponseType = Promise<Record<string, any>>;

declare global {
  var communitySystemPlugins: SystemPluginTemplateItemType[];
  var communitySystemPluginCb: Record<string, (e: any) => SystemPluginResponseType>;
}
