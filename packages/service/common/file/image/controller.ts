import { UploadImgProps } from '@fastgpt/global/common/file/api';
import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';
import { MongoImage } from './schema';
import { ClientSession } from '../../../common/mongo';

export function getMongoImgUrl(id: string) {
  return `${imageBaseUrl}${id}`;
}

export const maxImgSize = 1024 * 1024 * 12;
const base64MimeRegex = /data:image\/([^\)]+);base64/;
export async function uploadMongoImg({
  type,
  base64Img,
  teamId,
  expiredTime,
  metadata,
  shareId
}: UploadImgProps & {
  teamId: string;
}) {
  if (base64Img.length > maxImgSize) {
    return Promise.reject('Image too large');
  }

  const [base64Mime, base64Data] = base64Img.split(',')
  const mime = `image/${base64Mime.match(base64MimeRegex)?.[1] ?? 'jpeg'}`
  const binary = Buffer.from(base64Data, 'base64');

  const { _id } = await MongoImage.create({
    type,
    teamId,
    binary,
    expiredTime,
    metadata: Object.assign({ mime }, metadata),
    shareId
  });

  return getMongoImgUrl(String(_id));
}

export async function readMongoImg({ id }: { id: string }) {
  const data = await MongoImage.findById(id);
  if (!data) {
    return Promise.reject('Image not found');
  }
  return data;
}

export async function delImgByRelatedId({
  teamId,
  relateIds,
  session
}: {
  teamId: string;
  relateIds: string[];
  session: ClientSession;
}) {
  if (relateIds.length === 0) return;

  return MongoImage.deleteMany(
    {
      teamId,
      'metadata.relatedId': { $in: relateIds.map((id) => String(id)) }
    },
    { session }
  );
}
