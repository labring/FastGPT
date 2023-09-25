import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import jwt from 'jsonwebtoken';
import { ERROR_ENUM } from '@/service/errorCode';
import { GridFSStorage } from '@/service/lib/gridfs';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { fileId } = req.query as { fileId: string };

    if (!fileId) {
      throw new Error('fileId is empty');
    }

    const { userId } = await authUser({ req, authToken: true });

    // auth file
    const gridFs = new GridFSStorage('dataset', userId);
    await gridFs.findAndAuthFile(fileId);

    const token = await createFileToken({
      userId,
      fileId
    });

    jsonRes(res, {
      data: `/api/support/file/read?token=${token}`
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}

export const createFileToken = (data: { userId: string; fileId: string }) => {
  if (!process.env.FILE_TOKEN_KEY) {
    return Promise.reject('System unset FILE_TOKEN_KEY');
  }
  const expiredTime = Math.floor(Date.now() / 1000) + 60 * 30;

  const key = process.env.FILE_TOKEN_KEY as string;
  const token = jwt.sign(
    {
      ...data,
      exp: expiredTime
    },
    key
  );
  return Promise.resolve(token);
};

export const authFileToken = (token?: string) =>
  new Promise<{ userId: string; fileId: string }>((resolve, reject) => {
    if (!token) {
      return reject(ERROR_ENUM.unAuthFile);
    }
    const key = process.env.FILE_TOKEN_KEY as string;

    jwt.verify(token, key, function (err, decoded: any) {
      if (err || !decoded?.userId || !decoded?.fileId) {
        reject(ERROR_ENUM.unAuthFile);
        return;
      }
      resolve({
        userId: decoded.userId,
        fileId: decoded.fileId
      });
    });
  });
