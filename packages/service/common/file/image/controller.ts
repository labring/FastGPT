import { UploadImgProps } from '@fastgpt/global/common/file/api';
import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';
import { MongoImage } from './schema';

export function getMongoImgUrl(id: string) {
  return `${imageBaseUrl}${id}`;
}

export const maxImgSize = 1024 * 1024 * 12;
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

  const base64Data = base64Img.split(',')[1];
  const binary = Buffer.from(base64Data, 'base64');

  const { _id } = await MongoImage.create({
    type,
    teamId,
    binary,
    expiredTime: expiredTime,
    metadata,

    shareId
  });

  return getMongoImgUrl(String(_id));
}

export async function readMongoImg({ id }: { id: string }) {
  const data = await MongoImage.findById(id);
  if (!data) {
    return Promise.reject('Image not found');
  }
  return data?.binary;
}

export async function delImgByFileIdList(fileIds: string[]) {
  return MongoImage.deleteMany({
    'metadata.fileId': { $in: fileIds.map((item) => String(item)) }
  });
}
