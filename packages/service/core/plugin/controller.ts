import { CreateOnePluginParams, UpdatePluginParams } from '@fastgpt/global/core/plugin/controller';
import { MongoPlugin } from './schema';
import { FlowModuleTemplateType } from '@fastgpt/global/core/module/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { formatPluginIOModules } from '@fastgpt/global/core/module/utils';

export async function createOnePlugin(data: CreateOnePluginParams & { userId: string }) {
  const { _id } = await MongoPlugin.create(data);
  return _id;
}

export async function updateOnePlugin({
  id,
  userId,
  ...data
}: UpdatePluginParams & { userId: string }) {
  await MongoPlugin.findOneAndUpdate({ _id: id, userId }, data);
}

export async function deleteOnePlugin({ id, userId }: { id: string; userId: string }) {
  await MongoPlugin.findOneAndDelete({ _id: id, userId });
}
export async function getUserPlugins({ userId }: { userId: string }) {
  return MongoPlugin.find({ userId }, 'name avatar intro');
}
export async function getOnePluginDetail({ id, userId }: { userId: string; id: string }) {
  return MongoPlugin.findOne({ _id: id, userId });
}
/* plugin templates */
export async function getUserPlugins2Templates({
  userId
}: {
  userId: string;
}): Promise<FlowModuleTemplateType[]> {
  const plugins = await MongoPlugin.find({ userId }).lean();

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
export async function getPluginModuleDetail({ id, userId }: { userId: string; id: string }) {
  const plugin = await getOnePluginDetail({ id, userId });
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
