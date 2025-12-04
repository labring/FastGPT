import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import jwt from 'jsonwebtoken';

export const authDatasetImagePreviewUrl = (token?: string) =>
  new Promise<{
    teamId: string;
    datasetId: string;
    imageId: string;
  }>((resolve, reject) => {
    if (!token) {
      return reject(ERROR_ENUM.unAuthFile);
    }
    const key = (process.env.FILE_TOKEN_KEY as string) ?? 'filetoken';

    jwt.verify(token, key, (err, decoded: any) => {
      if (err || !decoded?.teamId || !decoded?.datasetId) {
        reject(ERROR_ENUM.unAuthFile);
        return;
      }
      resolve({
        teamId: decoded.teamId,
        datasetId: decoded.datasetId,
        imageId: decoded.imageId
      });
    });
  });
