import { MongoUserInform } from './schema';
import { MongoUser } from '../schema';
import { InformTypeEnum } from '@fastgpt/global/support/user/constant';

export type SendInformProps = {
  type: `${InformTypeEnum}`;
  title: string;
  content: string;
};

export async function sendInform2AllUser({ type, title, content }: SendInformProps) {
  const users = await MongoUser.find({}, '_id');
  await MongoUserInform.insertMany(
    users.map(({ _id }) => ({
      type,
      title,
      content,
      userId: _id
    }))
  );
}

export async function sendInform2OneUser({
  type,
  title,
  content,
  userId
}: SendInformProps & { userId: string }) {
  const inform = await MongoUserInform.findOne({
    type,
    title,
    content,
    userId,
    time: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
  });

  if (inform) return;

  await MongoUserInform.create({
    type,
    title,
    content,
    userId
  });
}
