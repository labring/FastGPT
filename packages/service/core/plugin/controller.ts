import { MongoPlugin } from './schema';
import { FlowModuleTemplateType } from '@fastgpt/global/core/module/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { plugin2ModuleIO } from '@fastgpt/global/core/module/utils';
import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';
import type { PluginRuntimeType, PluginTemplateType } from '@fastgpt/global/core/plugin/type.d';
import { ModuleTemplateTypeEnum } from '@fastgpt/global/core/module/constants';

/* 
  plugin id rule:
  personal: id
  community: community-id
  commercial: commercial-id
*/

export async function splitCombinePluginId(id: string) {
  const splitRes = id.split('-');
  if (splitRes.length === 1) {
    return {
      source: PluginSourceEnum.personal,
      pluginId: id
    };
  }

  const [source, pluginId] = id.split('-') as [`${PluginSourceEnum}`, string];
  if (!source || !pluginId) return Promise.reject('pluginId not found');

  return { source, pluginId: id };
}

const getPluginTemplateById = async (id: string): Promise<PluginTemplateType> => {
  const { source, pluginId } = await splitCombinePluginId(id);
  if (source === PluginSourceEnum.community) {
    const item = global.communityPlugins?.find((plugin) => plugin.id === pluginId);
    if (!item) return Promise.reject('plugin not found');

    return item;
  }
  if (source === PluginSourceEnum.personal) {
    const item = await MongoPlugin.findById(id).lean();
    if (!item) return Promise.reject('plugin not found');
    return {
      id: String(item._id),
      teamId: String(item.teamId),
      name: item.name,
      avatar: item.avatar,
      intro: item.intro,
      showStatus: true,
      source: PluginSourceEnum.personal,
      modules: item.modules,
      templateType: ModuleTemplateTypeEnum.personalPlugin
    };
  }
  return Promise.reject('plugin not found');
};

/* format plugin modules to plugin preview module */
export async function getPluginPreviewModule({
  id
}: {
  id: string;
}): Promise<FlowModuleTemplateType> {
  const plugin = await getPluginTemplateById(id);

  return {
    id: plugin.id,
    templateType: plugin.templateType,
    flowType: FlowNodeTypeEnum.pluginModule,
    avatar: plugin.avatar,
    name: plugin.name,
    intro: plugin.intro,
    showStatus: plugin.showStatus,
    ...plugin2ModuleIO(plugin.id, plugin.modules)
  };
}

/* run plugin time */
export async function getPluginRuntimeById(id: string): Promise<PluginRuntimeType> {
  const plugin = await getPluginTemplateById(id);

  return {
    teamId: plugin.teamId,
    name: plugin.name,
    avatar: plugin.avatar,
    showStatus: plugin.showStatus,
    modules: plugin.modules
  };
}
