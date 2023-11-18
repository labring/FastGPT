import { imageBaseUrl } from './constant';
import { MongoImage } from './schema';

export function getMongoImgUrl(id: string) {
  return `${imageBaseUrl}${id}`;
}

export const maxImgSize = 1024 * 1024 * 12;
export async function uploadMongoImg({
  base64Img,
  teamId,
  expiredTime
}: {
  base64Img: string;
  teamId: string;
  expiredTime?: Date;
}) {
  if (base64Img.length > maxImgSize) {
    return Promise.reject('Image too large');
  }

  const base64Data = base64Img.split(',')[1];

  const { _id } = await MongoImage.create({
    teamId,
    binary: Buffer.from(base64Data, 'base64'),
    expiredTime
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
