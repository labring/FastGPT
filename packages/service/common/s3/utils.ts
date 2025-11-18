import jwt from 'jsonwebtoken';
import { differenceInMilliseconds, addDays } from 'date-fns';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

export function jwtSignS3ObjectKey(objectKey: string) {
  const secret = process.env.FILE_TOKEN_KEY as string;
  const now = new Date();
  const expiresIn = differenceInMilliseconds(addDays(now, 90), now);
  const token = jwt.sign({ objectKey }, secret, { expiresIn });

  return token;
}

export function jwtVerifyS3ObjectKey(token: string) {
  const secret = process.env.FILE_TOKEN_KEY as string;
  return new Promise<{ objectKey: string }>((resolve, reject) => {
    jwt.verify(token, secret, (err, payload) => {
      if (err || !payload || !(payload as jwt.JwtPayload).objectKey) {
        reject(ERROR_ENUM.unAuthFile);
      }

      resolve(payload as { objectKey: string });
    });
  });
}
