import { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoUser } from '@fastgpt/service/support/user/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { username, password, status, _id } = req.body as {
      username: string;
      password: string;
      status: string;
      _id: string;
    };
    const user = await MongoUser.updateOne(
      { _id },
      {
        username,
        password,
        status
      }
    );
    jsonRes(res, {
      data: user
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
