import { CreateOneModuleParams, UpdateNoduleParams } from '@fastgpt/global/core/module/controller';
import { MongoModule } from './schema';

export async function createOneModule(data: CreateOneModuleParams & { userId: string }) {
  const { _id } = await MongoModule.create(data);
  return _id;
}

export async function updateOneModule({
  id,
  userId,
  ...data
}: UpdateNoduleParams & { userId: string }) {
  await MongoModule.findOneAndUpdate({ _id: id, userId }, data);
}

export async function deleteOneModule({ id, userId }: { id: string; userId: string }) {
  await MongoModule.findOneAndDelete({ _id: id, userId });
}
export async function getUserModules({ userId }: { userId: string }) {
  return MongoModule.find({ userId }, 'name avatar intro');
}
export async function getOneModuleDetail({ id, userId }: { userId: string; id: string }) {
  return MongoModule.findOne({ _id: id, userId });
}
