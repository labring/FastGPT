import { CreateOnePluginParams, UpdatePluginParams } from '@fastgpt/global/core/plugin/controller';
import { MongoPlugin } from './schema';

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
