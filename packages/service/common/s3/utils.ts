import jwt from 'jsonwebtoken';
import { differenceInMilliseconds, addDays } from 'date-fns';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { S3Sources } from './type';
import { getS3ChatSource } from './sources/chat';
import { getS3DatasetSource } from './sources/dataset';
import { EndpointUrl } from '@fastgpt/global/common/file/constants';

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

export async function replaceDatasetQuoteTextWithJWT(datasetQuoteText: string) {
  if (!datasetQuoteText || typeof datasetQuoteText !== 'string') return datasetQuoteText as string;

  const prefixPattern = Object.values(S3Sources)
    .map((pattern) => `${pattern}\\/[^\\s)]+`)
    .join('|');
  const regex = new RegExp(String.raw`(!?)\[([^\]]+)\]\((?!https?:\/\/)(${prefixPattern})\)`, 'g');
  const s3DatasetSource = getS3DatasetSource();
  const s3ChatSource = getS3ChatSource();

  const matches = Array.from(datasetQuoteText.matchAll(regex));
  let content = datasetQuoteText;

  for (const match of matches.slice().reverse()) {
    const [full, bang, alt, objectKey] = match;

    if (s3DatasetSource.isDatasetObjectKey(objectKey) || s3ChatSource.isChatFileKey(objectKey)) {
      const url = `${EndpointUrl}/api/system/file/${jwtSignS3ObjectKey(objectKey)}`;
      const replacement = `${bang}[${alt}](${url})`;
      content =
        content.slice(0, match.index) + replacement + content.slice(match.index + full.length);
    }
  }

  return content;
}
