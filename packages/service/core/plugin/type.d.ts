import { PluginTemplateType } from '@fastgpt/global/core/plugin/type.d';

declare global {
  var communityPluginsV1: PluginTemplateType[];
  var communityPlugins: PluginTemplateType[];
}
