import { PluginTemplateType } from '@fastgpt/global/core/plugin/type.d';
import { SystemPluginTemplateItemType } from '@fastgpt/global/core/workflow/type';

declare global {
  var communityPluginsV1: PluginTemplateType[];
  var communityPlugins: SystemPluginTemplateItemType[];
}
