import { MongoPlugin } from './schema';
import { FlowModuleTemplateType } from '@fastgpt/global/core/module/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { formatPluginIOModules } from '@fastgpt/global/core/module/utils';

/* plugin templates */
export async function getUserPlugins2Templates({
  teamId
}: {
  teamId: string;
}): Promise<FlowModuleTemplateType[]> {
  const plugins = await MongoPlugin.find({ teamId }).lean();

  return plugins.map((plugin) => ({
    id: String(plugin._id),
    flowType: FlowNodeTypeEnum.pluginModule,
    logo: plugin.avatar,
    name: plugin.name,
    description: plugin.intro,
    intro: plugin.intro,
    showStatus: false,
    inputs: [],
    outputs: []
  }));
}
/* one plugin 2 module detail */
export async function getPluginModuleDetail({ id }: { id: string }) {
  const plugin = await MongoPlugin.findById(id);
  if (!plugin) return Promise.reject('plugin not found');
  return {
    id: String(plugin._id),
    flowType: FlowNodeTypeEnum.pluginModule,
    logo: plugin.avatar,
    name: plugin.name,
    description: plugin.intro,
    intro: plugin.intro,
    showStatus: false,
    ...formatPluginIOModules(String(plugin._id), plugin.modules)
  };
}
