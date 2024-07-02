import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SystemPluginTemplateItemType } from '@fastgpt/global/core/workflow/type';
import { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import { SystemPluginResponseType } from './type';

const list = ['getTime'];

// Do not modify the following code
const plugins = list.map((name) => require(`./src/${name}/template.json`));
export const communityPlugins = plugins.map<SystemPluginTemplateItemType>((plugin) => ({
  ...plugin,
  id: `${PluginSourceEnum.community}-${plugin.id}`
}));

export const communityPluginsTemplateList = communityPlugins.map<NodeTemplateListItemType>(
  (plugin) => ({
    id: plugin.id,
    templateType: plugin.templateType ?? FlowNodeTemplateTypeEnum.other,
    flowNodeType: FlowNodeTypeEnum.pluginModule,
    avatar: plugin.avatar,
    name: plugin.name,
    intro: plugin.intro
  })
);

export const communityCb: Record<string, (e: any) => SystemPluginResponseType> = {};
list.forEach((name) => {
  communityCb[name] = require(`./src/${name}/index`).default;
});
